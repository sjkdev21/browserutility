const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const guidelinesInput = document.getElementById("guidelines");
const markdownFileInput = document.getElementById("markdownFile");
const autoMergeInput = document.getElementById("autoMerge");
const mergeServiceUrlInput = document.getElementById("mergeServiceUrl");
const saveButton = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b42318" : "#5f6b7a";
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get([
    "openaiApiKey",
    "openaiModel",
    "replyGuidelinesMarkdown",
    "autoMergeYouTubeStreams",
    "mergeServiceUrl"
  ]);
  apiKeyInput.value = stored.openaiApiKey || "";
  modelInput.value = stored.openaiModel || "gpt-4o-mini";
  guidelinesInput.value = stored.replyGuidelinesMarkdown || "";
  autoMergeInput.checked = Boolean(stored.autoMergeYouTubeStreams);
  mergeServiceUrlInput.value = stored.mergeServiceUrl || "http://127.0.0.1:8765/merge";
}

async function saveSettings() {
  const payload = {
    openaiApiKey: apiKeyInput.value.trim(),
    openaiModel: modelInput.value.trim() || "gpt-4o-mini",
    replyGuidelinesMarkdown: guidelinesInput.value,
    autoMergeYouTubeStreams: autoMergeInput.checked,
    mergeServiceUrl: mergeServiceUrlInput.value.trim() || "http://127.0.0.1:8765/merge"
  };

  await chrome.storage.sync.set(payload);
  setStatus("Saved.");
}

markdownFileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    guidelinesInput.value = text;
    setStatus(`Loaded ${file.name}. Save to persist.`);
  } catch (error) {
    setStatus(error.message || "Failed to read markdown file.", true);
  }
});

saveButton.addEventListener("click", () => {
  saveSettings().catch((error) => setStatus(error.message || "Save failed.", true));
});

loadSettings().catch((error) => setStatus(error.message || "Could not load settings.", true));
