#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() {
  printf '[install-helper] %s\n' "$*"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

install_ffmpeg_macos() {
  if ! need_cmd brew; then
    log "Homebrew is required to install ffmpeg on macOS. Install brew first: https://brew.sh"
    exit 1
  fi
  log "Installing ffmpeg via Homebrew..."
  brew install ffmpeg
}

install_ffmpeg_linux() {
  if need_cmd apt-get; then
    log "Installing ffmpeg via apt-get..."
    sudo apt-get update
    sudo apt-get install -y ffmpeg
    return
  fi

  if need_cmd dnf; then
    log "Installing ffmpeg via dnf..."
    sudo dnf install -y ffmpeg
    return
  fi

  if need_cmd pacman; then
    log "Installing ffmpeg via pacman..."
    sudo pacman -Sy --noconfirm ffmpeg
    return
  fi

  if need_cmd zypper; then
    log "Installing ffmpeg via zypper..."
    sudo zypper install -y ffmpeg
    return
  fi

  log "Unsupported Linux package manager. Install ffmpeg manually and rerun this script."
  exit 1
}

ensure_python() {
  if need_cmd python3; then
    PYTHON_BIN="python3"
  elif need_cmd python; then
    PYTHON_BIN="python"
  else
    log "Python 3 is required. Please install Python 3 and rerun."
    exit 1
  fi

  export PYTHON_BIN
}

main() {
  case "$(uname -s)" in
    Darwin)
      log "Detected macOS"
      if ! need_cmd ffmpeg; then
        install_ffmpeg_macos
      fi
      ;;
    Linux)
      log "Detected Linux"
      if ! need_cmd ffmpeg; then
        install_ffmpeg_linux
      fi
      ;;
    *)
      log "This script supports Linux/macOS. Use scripts/install_helper.ps1 on Windows."
      exit 1
      ;;
  esac

  ensure_python

  if ! need_cmd ffmpeg; then
    log "ffmpeg install did not succeed."
    exit 1
  fi

  log "Validating merge helper script..."
  "$PYTHON_BIN" -m py_compile "$ROOT_DIR/tools/merge_server.py"

  cat <<MSG

Setup complete.

Next steps:
1. Start merge server:
   $PYTHON_BIN "$ROOT_DIR/tools/merge_server.py" --host 127.0.0.1 --port 8765
2. In extension settings:
   - Enable 'Auto-merge separate YouTube audio/video tracks'
   - Set Merge Service URL to 'http://127.0.0.1:8765/merge'

MSG
}

main "$@"
