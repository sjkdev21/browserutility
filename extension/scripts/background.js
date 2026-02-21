const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MERGE_SERVICE_URL = "http://127.0.0.1:8765/merge";

async function readSettings() {
  const stored = await chrome.storage.sync.get([
    "openaiApiKey",
    "openaiModel",
    "replyGuidelinesMarkdown",
    "autoMergeYouTubeStreams",
    "mergeServiceUrl"
  ]);
  return {
    openaiApiKey: stored.openaiApiKey || "",
    openaiModel: stored.openaiModel || DEFAULT_MODEL,
    replyGuidelinesMarkdown: stored.replyGuidelinesMarkdown || "",
    autoMergeYouTubeStreams: Boolean(stored.autoMergeYouTubeStreams),
    mergeServiceUrl: (stored.mergeServiceUrl || DEFAULT_MERGE_SERVICE_URL).trim()
  };
}

function sanitizeFilename(raw) {
  return (raw || "video")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function extensionFromUrl(url, fallbackExt = "mp4") {
  try {
    const pathname = new URL(url).pathname || "";
    const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    return (match?.[1] || fallbackExt).toLowerCase();
  } catch {
    return fallbackExt;
  }
}

async function waitForDownloadComplete(downloadId, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const [item] = await chrome.downloads.search({ id: downloadId });
    if (!item) {
      throw new Error(`Download item not found for id ${downloadId}.`);
    }
    if (item.state === "complete") {
      return item;
    }
    if (item.state === "interrupted") {
      throw new Error(`Download interrupted for ${item.filename || downloadId}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for downloads to finish.");
}

async function startDownload(url, filename) {
  return chrome.downloads.download({
    url,
    filename,
    saveAs: false,
    conflictAction: "uniquify"
  });
}

async function mergeTracksWithService(mergeServiceUrl, videoPath, audioPath, outputPath) {
  const response = await fetch(mergeServiceUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_path: videoPath,
      audio_path: audioPath,
      output_path: outputPath
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Merge service failed (${response.status}): ${details.slice(0, 200)}`);
  }

  return response.json();
}

function buildPrompt(guidelinesMarkdown, sourceText) {
  const instructions = guidelinesMarkdown?.trim()
    ? guidelinesMarkdown.trim()
    : "Write a concise, clear, and respectful reply in a natural tone.";

  return [
    "Draft a response for X (Twitter).",
    "Return only the final reply text without analysis or bullets.",
    "",
    "Guidelines (markdown):",
    instructions,
    "",
    "Text to respond to:",
    sourceText
  ].join("\n");
}

function extractTextFromResponsePayload(data) {
  if (!data || typeof data !== "object") {
    return "";
  }

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks = [];
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) {
        chunks.push(part.text.trim());
      }
      if (typeof part?.output_text === "string" && part.output_text.trim()) {
        chunks.push(part.output_text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

async function generateReplyDraft(sourceText) {
  const { openaiApiKey, openaiModel, replyGuidelinesMarkdown } = await readSettings();

  if (!openaiApiKey) {
    throw new Error("Missing OpenAI API key. Add it in extension settings.");
  }

  const payload = {
    model: openaiModel || DEFAULT_MODEL,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: buildPrompt(replyGuidelinesMarkdown, sourceText) }]
      }
    ]
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${details.slice(0, 200)}`);
  }

  const data = await response.json();
  const draft = extractTextFromResponsePayload(data);

  if (!draft) {
    const status = data?.status ? ` Status: ${data.status}.` : "";
    throw new Error(`OpenAI response did not contain draft text.${status}`);
  }

  return draft;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message?.action === "generateReplyDraft") {
        const draft = await generateReplyDraft(message.sourceText || "");
        sendResponse({ ok: true, draft });
        return;
      }

      if (message?.action === "downloadUrl") {
        if (!message.url) {
          throw new Error("Missing URL to download.");
        }
        const base = sanitizeFilename(message.filenameHint || "video");
        const ext = extensionFromUrl(message.url, "mp4");
        const filename = `BrowserUtility/${base}.${ext}`;
        const downloadId = await startDownload(message.url, filename);
        sendResponse({ ok: true, downloadId });
        return;
      }

      if (message?.action === "downloadAndMergeTracks") {
        if (!message.videoUrl || !message.audioUrl) {
          throw new Error("Missing video/audio track URLs.");
        }

        const settings = await readSettings();
        const base = sanitizeFilename(message.baseName || "youtube-video");
        const videoExt = extensionFromUrl(message.videoUrl, "mp4");
        const audioExt = extensionFromUrl(message.audioUrl, "m4a");
        const videoFilename = `BrowserUtility/${base}.video.${videoExt}`;
        const audioFilename = `BrowserUtility/${base}.audio.${audioExt}`;
        const mergedFilename = `${base}.merged.mp4`;

        const videoDownloadId = await startDownload(message.videoUrl, videoFilename);
        const audioDownloadId = await startDownload(message.audioUrl, audioFilename);
        const [videoItem, audioItem] = await Promise.all([
          waitForDownloadComplete(videoDownloadId),
          waitForDownloadComplete(audioDownloadId)
        ]);

        if (!settings.autoMergeYouTubeStreams) {
          sendResponse({
            ok: true,
            downloaded: 2,
            merged: false,
            message: "Downloaded separate video/audio tracks. Enable auto-merge in settings to combine automatically."
          });
          return;
        }

        await mergeTracksWithService(
          settings.mergeServiceUrl || DEFAULT_MERGE_SERVICE_URL,
          videoItem.filename,
          audioItem.filename,
          mergedFilename
        );

        sendResponse({
          ok: true,
          downloaded: 2,
          merged: true,
          message: "Downloaded separate tracks and merged them into a single MP4."
        });
        return;
      }

      sendResponse({ ok: false, error: "Unsupported background action." });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || "Background action failed." });
    }
  })();

  return true;
});
