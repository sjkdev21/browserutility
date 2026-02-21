# Architecture Notes

## Purpose
Define how the extension's modular feature menu and runtime message flow are structured.

## Modules
- Popup (`popup.html`, `scripts/popup.js`):
- Feature launcher surface.
- Dispatches action messages to active tab content script.
- Applies site gating so unsupported actions are disabled by domain.

- Content script (`scripts/content.js`):
- Site-aware extraction actions.
- YouTube transcript retrieval and parsing.
- YouTube transcript panel open attempt and transcript DOM extraction.
- X context extraction and draft insertion.
- Video URL discovery on arbitrary pages.
- YouTube player-data probing from page context to discover direct stream URLs.

- Background service worker (`scripts/background.js`):
- OpenAI API calls using stored settings.
- Download initiation.
- Split-track coordination and merge-service invocation for YouTube fallback.

- Options page (`options.html`, `scripts/options.js`):
- Configuration for API key, model, and markdown guidance.
- Markdown file import.
- Merge options for local ffmpeg helper endpoint.

- Helper scripts (`scripts/*.sh`, `scripts/*.ps1`):
- Cross-platform installer/start wrappers for local merge service setup.

## Storage Effects
- `chrome.storage.sync` persists user configuration keys.
- No server-side persistence in this project.

## Test Coverage and Gaps
- Current: manual testing only.
- Gaps: no automated unit/integration test harness yet.

## Limitations
- Streaming/DRM media download support is partial and site-dependent.
- X composer insertion uses legacy `execCommand` fallback and can break with UI updates.
- Automatic split-track merge depends on external local helper availability and ffmpeg.
