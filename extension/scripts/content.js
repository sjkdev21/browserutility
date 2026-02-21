function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForElement(selectors, timeoutMs = 5000) {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    for (const selector of selectorList) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    await delay(150);
  }

  return null;
}

function extractTranscriptLinesFromDom() {
  const lineElements = Array.from(
    document.querySelectorAll(
      [
        "ytd-transcript-segment-renderer #segment-text",
        "ytd-transcript-segment-renderer .segment-text",
        "ytd-transcript-segment-renderer yt-formatted-string"
      ].join(", ")
    )
  );

  const lines = lineElements
    .map((element) => element.textContent?.replace(/\s+/g, " ").trim() || "")
    .filter(Boolean);

  return Array.from(new Set(lines));
}

async function openYouTubeTranscriptPanelIfNeeded() {
  const existingLines = extractTranscriptLinesFromDom();
  if (existingLines.length) {
    return true;
  }

  const directButton = document.querySelector(
    'button[aria-label*="transcript" i], tp-yt-paper-button[aria-label*="transcript" i]'
  );
  if (directButton instanceof HTMLElement) {
    directButton.click();
    await waitForElement("ytd-transcript-segment-renderer", 4000);
    return true;
  }

  const moreActionsButton = document.querySelector(
    'button[aria-label*="more actions" i], button[aria-label*="actions" i]'
  );
  if (moreActionsButton instanceof HTMLElement) {
    moreActionsButton.click();
    await delay(250);

    const menuItems = Array.from(
      document.querySelectorAll(
        "ytd-menu-service-item-renderer,tp-yt-paper-item,yt-formatted-string"
      )
    );
    const transcriptItem = menuItems.find((item) => /transcript/i.test(item.textContent || ""));
    if (transcriptItem instanceof HTMLElement) {
      transcriptItem.click();
      await waitForElement("ytd-transcript-segment-renderer", 5000);
      return true;
    }
  }

  return false;
}

async function fetchYouTubeTranscript() {
  if (!location.hostname.includes("youtube.com") || !location.pathname.startsWith("/watch")) {
    throw new Error("Open a YouTube watch page first.");
  }

  await openYouTubeTranscriptPanelIfNeeded();
  const transcriptContainer = await waitForElement(
    ["ytd-transcript-renderer", "ytd-engagement-panel-section-list-renderer"],
    6000
  );
  if (!transcriptContainer) {
    throw new Error("Could not find transcript panel. Open transcript on the page and try again.");
  }

  const lines = extractTranscriptLinesFromDom();
  if (!lines.length) {
    throw new Error("Transcript panel found, but no transcript text was detected.");
  }

  return lines.join("\n");
}

function findBestXContext() {
  const selection = window.getSelection()?.toString()?.trim();
  if (selection) {
    return selection;
  }

  const focusedComposer = document.querySelector('div[role="textbox"][data-testid="tweetTextarea_0"]');
  if (focusedComposer?.textContent?.trim()) {
    return focusedComposer.textContent.trim();
  }

  const openTweet = document.querySelector('article [data-testid="tweetText"]');
  if (openTweet?.textContent?.trim()) {
    return openTweet.textContent.trim();
  }

  throw new Error("No selected text or tweet text found.");
}

function placeDraftIntoXComposer(draft) {
  const composer = document.querySelector('div[role="textbox"][data-testid="tweetTextarea_0"]');
  if (!composer) {
    return false;
  }

  composer.focus();
  document.execCommand("selectAll", false);
  document.execCommand("insertText", false, draft);
  composer.dispatchEvent(new InputEvent("input", { bubbles: true, data: draft, inputType: "insertText" }));
  return true;
}

function discoverVideoUrls() {
  const urls = new Set();

  const videoElements = Array.from(document.querySelectorAll("video"));
  for (const video of videoElements) {
    if (video.currentSrc) {
      urls.add(video.currentSrc);
    }
    if (video.src) {
      urls.add(video.src);
    }

    const sources = Array.from(video.querySelectorAll("source"));
    for (const source of sources) {
      if (source.src) {
        urls.add(source.src);
      }
    }
  }

  const allLinks = Array.from(document.querySelectorAll("a[href]"));
  for (const link of allLinks) {
    const href = link.href;
    if (/\.(mp4|webm|mov|m4v|m3u8|mpd)(\?|$)/i.test(href) || /(m3u8|mpd)/i.test(href)) {
      urls.add(href);
    }
  }

  // Some sites store manifest URLs in inline scripts instead of anchor/video tags.
  const scriptTexts = Array.from(document.querySelectorAll("script"))
    .map((script) => script.textContent || "")
    .filter(Boolean);
  const manifestRegex = /https?:\/\/[^"'\\\s]+?(?:m3u8|mpd)[^"'\\\s]*/gi;
  for (const text of scriptTexts) {
    const matches = text.match(manifestRegex) || [];
    for (const raw of matches) {
      const cleaned = raw.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
      urls.add(cleaned);
    }
  }

  return Array.from(urls);
}

function discoverManifestCandidates(urls) {
  const candidates = new Set(
    urls.filter((url) => /\.(m3u8|mpd)(\?|$)/i.test(url) || /(m3u8|mpd)/i.test(url))
  );

  try {
    const resources = performance.getEntriesByType("resource");
    for (const entry of resources) {
      const name = entry?.name || "";
      if (/(m3u8|mpd)/i.test(name)) {
        candidates.add(name);
      }
    }
  } catch {
    // ignore performance API issues
  }

  return Array.from(candidates);
}

function isDownloadableDirectFile(url) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function parseSignatureCipher(cipher) {
  if (!cipher) {
    return null;
  }

  const params = new URLSearchParams(cipher);
  const rawUrl = params.get("url");
  if (!rawUrl) {
    return null;
  }

  const urlObj = new URL(rawUrl);
  const encryptedSig = params.get("s");
  if (encryptedSig) {
    return null;
  }

  const sp = params.get("sp") || "signature";
  const sig = params.get("sig") || params.get("signature");
  if (sig && !urlObj.searchParams.get(sp)) {
    urlObj.searchParams.set(sp, sig);
  }

  return urlObj.toString();
}

function urlFromYouTubeFormat(format) {
  if (format?.url) {
    return format.url;
  }

  if (format?.signatureCipher) {
    return parseSignatureCipher(format.signatureCipher);
  }

  if (format?.cipher) {
    return parseSignatureCipher(format.cipher);
  }

  return null;
}

function sortByBitrateDescending(formats) {
  return [...formats].sort((a, b) => {
    const ab = Number(a?.bitrate || 0);
    const bb = Number(b?.bitrate || 0);
    return bb - ab;
  });
}

async function readYouTubePlayerResponseFromPageContext() {
  return new Promise((resolve) => {
    const channel = `browserutility-player-response-${Math.random().toString(36).slice(2)}`;
    const cleanup = () => window.removeEventListener("message", onMessage);
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 3000);

    function onMessage(event) {
      if (event.source !== window || event.data?.channel !== channel) {
        return;
      }
      clearTimeout(timer);
      cleanup();
      resolve(event.data?.payload || null);
    }

    window.addEventListener("message", onMessage);

    const script = document.createElement("script");
    script.textContent = `(() => {
      const channel = ${JSON.stringify(channel)};
      try {
        const payload = window.ytInitialPlayerResponse || null;
        window.postMessage({ channel, payload }, "*");
      } catch (error) {
        window.postMessage({ channel, payload: null }, "*");
      }
    })();`;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
  });
}

async function discoverYouTubeStreamInfo() {
  if (!location.hostname.includes("youtube.com") || !location.pathname.startsWith("/watch")) {
    return null;
  }

  const playerResponse = await readYouTubePlayerResponseFromPageContext();
  const streamingData = playerResponse?.streamingData;
  if (!streamingData) {
    return null;
  }

  const progressiveFormats = Array.isArray(streamingData.formats) ? streamingData.formats : [];
  const adaptiveFormats = Array.isArray(streamingData.adaptiveFormats) ? streamingData.adaptiveFormats : [];

  const progressiveWithUrls = sortByBitrateDescending(
    progressiveFormats
      .map((format) => ({ format, url: urlFromYouTubeFormat(format) }))
      .filter((item) => item.url)
  );

  const adaptiveVideoWithUrls = sortByBitrateDescending(
    adaptiveFormats
      .filter((format) => /^video\//i.test(format?.mimeType || ""))
      .map((format) => ({ format, url: urlFromYouTubeFormat(format) }))
      .filter((item) => item.url)
  );

  const adaptiveAudioWithUrls = sortByBitrateDescending(
    adaptiveFormats
      .filter((format) => /^audio\//i.test(format?.mimeType || ""))
      .map((format) => ({ format, url: urlFromYouTubeFormat(format) }))
      .filter((item) => item.url)
  );

  const combinedUrl = progressiveWithUrls[0]?.url || null;
  const videoOnlyUrl = adaptiveVideoWithUrls[0]?.url || null;
  const audioOnlyUrl = adaptiveAudioWithUrls[0]?.url || null;
  const videoId = playerResponse?.videoDetails?.videoId || null;
  const title = playerResponse?.videoDetails?.title || document.title || "youtube-video";

  if (!combinedUrl && !(videoOnlyUrl && audioOnlyUrl)) {
    return null;
  }

  return { combinedUrl, videoOnlyUrl, audioOnlyUrl, videoId, title };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message?.action === "copyYouTubeTranscript") {
        const transcript = await fetchYouTubeTranscript();
        sendResponse({ ok: true, transcript });
        return;
      }

      if (message?.action === "draftXReply") {
        if (!location.hostname.includes("x.com")) {
          throw new Error("Open X (x.com) to draft a reply.");
        }

        const sourceText = findBestXContext();
        const generated = await chrome.runtime.sendMessage({ action: "generateReplyDraft", sourceText });

        if (!generated?.ok || !generated?.draft) {
          throw new Error(generated?.error || "Draft generation failed.");
        }

        const inserted = placeDraftIntoXComposer(generated.draft);

        sendResponse({
          ok: true,
          draft: generated.draft,
          message: inserted ? "Draft inserted into composer." : "Draft generated."
        });
        return;
      }

      if (message?.action === "downloadPageVideo") {
        const discovered = discoverVideoUrls();
        const manifestCandidates = discoverManifestCandidates(discovered);

        if (location.hostname.includes("youtube.com") && location.pathname.startsWith("/watch")) {
          const ytInfo = await discoverYouTubeStreamInfo();
          if (ytInfo?.combinedUrl) {
            await chrome.runtime.sendMessage({
              action: "downloadUrl",
              url: ytInfo.combinedUrl,
              filenameHint: ytInfo.title || "youtube-video"
            });
            sendResponse({
              ok: true,
              downloaded: 1,
              message: `Started 1 combined download.${manifestCandidates.length ? " Streaming manifests found." : ""}`,
              manifestCandidates,
              manifestText: manifestCandidates.join("\n")
            });
          } else if (ytInfo?.videoOnlyUrl && ytInfo?.audioOnlyUrl) {
            const merged = await chrome.runtime.sendMessage({
              action: "downloadAndMergeTracks",
              videoUrl: ytInfo.videoOnlyUrl,
              audioUrl: ytInfo.audioOnlyUrl,
              baseName: ytInfo.title || "youtube-video"
            });
            if (!merged?.ok) {
              throw new Error(merged?.error || "Failed to download and merge YouTube tracks.");
            }
            sendResponse({
              ok: true,
              downloaded: merged.downloaded || 2,
              message: merged.message || "Downloaded split tracks and requested merge.",
              manifestCandidates,
              manifestText: manifestCandidates.join("\n")
            });
          } else {
            const helperResult = await chrome.runtime.sendMessage({
              action: "downloadYouTubeViaHelper",
              videoUrl: location.href,
              titleHint: document.title || "youtube-video"
            });
            if (!helperResult?.ok) {
              throw new Error(
                helperResult?.error ||
                  "Could not find downloadable YouTube stream URLs on this page, and helper fallback failed."
              );
            }
            sendResponse({
              ok: true,
              downloaded: 1,
              message: helperResult.message || "Started helper-based YouTube download.",
              manifestCandidates,
              manifestText: manifestCandidates.join("\n")
            });
          }
          return;
        }

        if (!discovered.length) {
          throw new Error("No video URLs discovered on this page.");
        }

        let downloaded = 0;
        for (const url of discovered) {
          if (isDownloadableDirectFile(url)) {
            await chrome.runtime.sendMessage({ action: "downloadUrl", url });
            downloaded += 1;
          }
        }

        const helperErrors = [];

        if (downloaded === 0 && manifestCandidates.length) {
          let manifestDownloaded = false;
          for (const manifestUrl of manifestCandidates) {
            const helperResult = await chrome.runtime.sendMessage({
              action: "downloadManifestViaHelper",
              manifestUrl,
              titleHint: document.title || "stream-video",
              pageUrl: location.href
            });
            if (helperResult?.ok) {
              manifestDownloaded = true;
              sendResponse({
                ok: true,
                downloaded: 1,
                message:
                  helperResult.message ||
                  "Started helper-based stream download from manifest.",
                manifestCandidates,
                manifestText: manifestCandidates.join("\n")
              });
              return;
            }
            helperErrors.push(helperResult?.error || `Manifest helper failed for ${manifestUrl}`);
          }

          if (!manifestDownloaded && helperErrors.length === 0) {
            helperErrors.push("Manifest helper did not return a successful response.");
          }
        }

        if (downloaded === 0) {
          const helperResult = await chrome.runtime.sendMessage({
            action: "downloadPageViaHelper",
            pageUrl: location.href,
            titleHint: document.title || "page-video"
          });
          if (helperResult?.ok) {
            sendResponse({
              ok: true,
              downloaded: 1,
              message: helperResult.message || "Started helper-based page video download.",
              manifestCandidates,
              manifestText: manifestCandidates.join("\n")
            });
            return;
          }
          helperErrors.push(helperResult?.error || "Page helper fallback failed.");
          throw new Error(
            `No direct downloadable media found. Helper fallbacks failed: ${helperErrors.join(" | ")}`
          );
        }

        sendResponse({
          ok: true,
          downloaded,
          message:
            downloaded > 0
              ? `Started ${downloaded} download(s).${manifestCandidates.length ? " Streaming manifests found." : ""}`
              : "Only streaming manifests found. See clipboard.",
          manifestCandidates,
          manifestText: manifestCandidates.join("\n")
        });

        return;
      }

      sendResponse({ ok: false, error: "Unknown action." });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || "Action failed." });
    }
  })();

  return true;
});
