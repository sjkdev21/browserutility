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
- If direct stream URLs are unavailable, falls back to helper-side YouTube download via `yt-dlp`.
- Detects streaming manifests (`.m3u8`, `.mpd`) and copies them to clipboard.
- On non-YouTube pages with manifest-only streams, automatically tries helper-side manifest download via `yt-dlp`.

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
1. Run installer (uses Homebrew for `ffmpeg` and downloads latest local `yt-dlp`):
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

The helper service now supports:
- `/merge` for combining separate downloaded tracks.
- `/download_youtube` for robust YouTube fallback downloads using `yt-dlp`.
- `/download_manifest` for generic HLS/DASH manifest downloads using `yt-dlp`.
- `/download_page` for generic page-level video extraction using `yt-dlp` when manifests are hidden.

The installer downloads a project-local `yt-dlp` binary under `tools/bin/` and startup scripts use that binary by default.
The helper now logs request lifecycle events with timestamps (start, attempts, success/failure) to terminal/stdout.

Troubleshooting:
- If you see `nsig extraction failed`, update yt-dlp and restart helper:
  - Linux/macOS: rerun `./scripts/install_helper.sh`
  - Windows: rerun `powershell -ExecutionPolicy Bypass -File .\scripts\install_helper.ps1`

## Test Coverage
- No automated tests yet in this initial scaffold.
- Manual verification is currently required per feature.
