# Browser Utility Toolkit (Chrome Extension)

This repository contains a Manifest V3 Chrome extension with a growing menu of productivity features.

## Current Features
1. YouTube transcript copier:
- On a YouTube watch page, opens transcript panel (when possible) and extracts transcript text without timestamps.
- Copies transcript to clipboard from popup action.

2. X reply drafting with ChatGPT:
- On x.com, captures selected text or visible tweet context.
- Sends context to OpenAI Responses API.
- Uses configurable markdown guidelines from extension settings.
- Copies draft to clipboard and attempts to place draft in active composer.

3. Video finder and downloader:
- Scans the current page for video URLs.
- Starts downloads for direct video files (`.mp4`, `.webm`, `.mov`, `.m4v`).
- On YouTube watch pages, tries combined stream first.
- If only split tracks are available, downloads video+audio tracks and can auto-merge them through a local ffmpeg helper service.
- Detects streaming manifests (`.m3u8`, `.mpd`) and copies them to clipboard.

## Entry Points and Usage
- Extension root: `extension/`
- Popup UI: `extension/popup.html`
- Settings UI: `extension/options.html`
- Background service worker: `extension/scripts/background.js`
- Content script: `extension/scripts/content.js`
- Local merge helper service: `tools/merge_server.py`

Load in Chrome:
1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `extension/` folder.

## Data Flow and Storage
- Local browser storage (`chrome.storage.sync`):
- `openaiApiKey`: OpenAI API key.
- `openaiModel`: model name (default `gpt-4o-mini`).
- `replyGuidelinesMarkdown`: markdown instructions used to steer reply tone/style.
- `autoMergeYouTubeStreams`: whether split YouTube streams should be auto-merged.
- `mergeServiceUrl`: local merge API endpoint (default `http://127.0.0.1:8765/merge`).

- Messaging flow:
- Popup action -> content script (`chrome.tabs.sendMessage`).
- Content script -> background (`chrome.runtime.sendMessage`) for:
  - OpenAI API call (`generateReplyDraft`)
  - Download initiation (`downloadUrl`)
  - Split-track download + merge (`downloadAndMergeTracks`)
- Popup domain gating:
- YouTube action enabled only on `youtube.com/watch` pages.
- X action enabled only on `x.com`.
- Video download action remains enabled on any site.

## Known Limitations
- YouTube transcript extraction requires available captions.
- Some YouTube layouts/localizations may require manually opening the transcript panel before extraction.
- X draft insertion uses editor heuristics and may fail if DOM changes.
- "Any video" download is best-effort:
- direct file URLs are supported.
- Auto-merge requires local `ffmpeg` and running `tools/merge_server.py`.
- DRM-protected streams are not downloadable with this extension-only approach.
- `.m3u8` / `.mpd` manifests are detected and copied, but not transcoded/merged.

## Local Merge Setup
### Linux
1. Run installer:
```bash
./scripts/install_helper.sh
```
2. Start merge helper:
```bash
./scripts/start_merge_helper.sh
```

### macOS
1. Run installer (uses Homebrew for `ffmpeg`):
```bash
./scripts/install_helper.sh
```
2. Start merge helper:
```bash
./scripts/start_merge_helper.sh
```

### Windows (PowerShell)
1. Run installer from repo root:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_helper.ps1
```
2. Start merge helper:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_merge_helper.ps1
```

### Extension Settings
1. Enable `Auto-merge separate YouTube audio/video tracks`.
2. Set `Merge Service URL` to `http://127.0.0.1:8765/merge`.

## Test Coverage
- No automated tests yet in this initial scaffold.
- Manual verification is currently required per feature.
