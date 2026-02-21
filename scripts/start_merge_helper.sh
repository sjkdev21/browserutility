#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
YTDLP_LOCAL="$ROOT_DIR/tools/bin/yt-dlp"
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "Python 3 is required." >&2
  exit 1
fi

if [ ! -x "$YTDLP_LOCAL" ]; then
  echo "Local yt-dlp binary not found at $YTDLP_LOCAL" >&2
  echo "Run ./scripts/install_helper.sh first." >&2
  exit 1
fi

exec "$PY" "$ROOT_DIR/tools/merge_server.py" --host 127.0.0.1 --port 8765 --yt-dlp "$YTDLP_LOCAL"
