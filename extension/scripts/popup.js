const statusEl = document.getElementById("status");
const copyTranscriptBtn = document.getElementById("copyTranscriptBtn");
const draftReplyBtn = document.getElementById("draftReplyBtn");
const findVideosBtn = document.getElementById("findVideosBtn");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b42318" : "#5f6b7a";
}

async function withActiveTab(handler) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }
  return handler(tab);
}

async function runAction(action) {
  try {
    setStatus("Working...");
    const response = await withActiveTab((tab) => chrome.tabs.sendMessage(tab.id, { action }));

    if (!response) {
      setStatus("No response from page. Reload and try again.", true);
      return;
    }

    if (!response.ok) {
      setStatus(response.error || "Action failed.", true);
      return;
    }

    if (response.transcript) {
      await navigator.clipboard.writeText(response.transcript);
      setStatus(`Transcript copied (${response.transcript.length} chars).`);
      return;
    }

    if (response.draft) {
      let copied = false;
      try {
        await navigator.clipboard.writeText(response.draft);
        copied = true;
      } catch {
        copied = false;
      }
      setStatus(copied ? "Draft copied to clipboard." : "Draft created, but clipboard copy failed.");
      return;
    }

    if (response.manifestText) {
      try {
        await navigator.clipboard.writeText(response.manifestText);
        setStatus(response.message ? `${response.message} Manifest URLs copied.` : "Manifest URLs copied.");
      } catch {
        setStatus(response.message || "Action completed, but manifest copy failed.", true);
      }
      return;
    }

    if (response.downloaded) {
      setStatus(`Started ${response.downloaded} download(s).`);
      return;
    }

    setStatus(response.message || "Done.");
  } catch (error) {
    setStatus(error.message || "Unexpected error.", true);
  }
}

async function applyDomainGating() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";

  const onYouTube = /^https?:\/\/(?:www\.)?youtube\.com\/watch/i.test(url);
  const onX = /^https?:\/\/(?:www\.)?x\.com\//i.test(url);

  copyTranscriptBtn.disabled = !onYouTube;
  copyTranscriptBtn.title = onYouTube ? "" : "Available on YouTube watch pages.";

  draftReplyBtn.disabled = !onX;
  draftReplyBtn.title = onX ? "" : "Available on x.com pages.";

  findVideosBtn.disabled = false;
  findVideosBtn.title = "Available on all pages.";
}

copyTranscriptBtn.addEventListener("click", () => runAction("copyYouTubeTranscript"));
draftReplyBtn.addEventListener("click", () => runAction("draftXReply"));
findVideosBtn.addEventListener("click", () => runAction("downloadPageVideo"));
document.getElementById("openSettings").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

applyDomainGating().catch((error) => setStatus(error.message || "Could not determine current site.", true));
