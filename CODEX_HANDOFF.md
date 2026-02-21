# Codex Handoff

## Completed Milestones
- Created initial Chrome extension scaffold under `extension/`.
- Implemented popup with feature menu:
  - Copy YouTube transcript
  - Draft X reply via ChatGPT
  - Find/download page video
- Implemented settings page with:
  - OpenAI API key
  - model setting
  - markdown guideline editor
  - markdown file import support
- Implemented background service worker actions:
  - OpenAI Responses API call
  - download initiation through `chrome.downloads`
- Added popup domain gating:
  - YouTube transcript action enabled only on watch pages
  - X drafting action enabled only on x.com
  - Video action remains enabled globally
- Reworked YouTube transcript extraction to use transcript panel DOM scraping with auto-open attempts.
- Improved YouTube video download path to prioritize single combined audio+video stream URLs from player data.
- Added fallback split-track flow for YouTube: download separate video/audio and optionally auto-merge via local helper service.
- Added local merge helper script: `tools/merge_server.py` (ffmpeg-backed HTTP endpoint).
- Added cross-platform helper scripts:
  - `scripts/install_helper.sh` (Linux/macOS)
  - `scripts/install_helper.ps1` (Windows)
  - `scripts/start_merge_helper.sh`
  - `scripts/start_merge_helper.ps1`
- Fixed X reply generation parsing to support multiple OpenAI Responses output formats (`output_text` and `output[].content[].text`).
- Added foundational documentation (`README.md`).

## In-Progress Work
- Hardening selectors and flows against DOM changes on YouTube/X.
- Improving streaming video handling beyond manifest discovery and handling signature-ciphered-only streams.
- Improving fallback behavior when YouTube combined streams are not exposed.

## Next Planned Steps
1. Add automated tests for transcript extraction, YouTube stream selection, and URL classification logic.
2. Add richer X context extraction (thread + author + selected fragment).
3. Add optional HLS/DASH merge/transcode path through local helper service.
4. Add icons and polish packaging/release process.

## Blockers / Environment Constraints
- Browser extension-only implementation cannot reliably download DRM-protected streams.
- DOM structures on YouTube and X can change without notice.
- OpenAI usage requires user-provided API key and network access.
- YouTube transcript behavior depends on transcript panel availability in current UI locale/layout.
- Auto-merge requires running a local merge service and having ffmpeg installed on host.
