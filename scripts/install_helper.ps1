param(
  [switch]$SkipFfmpegInstall
)

$ErrorActionPreference = 'Stop'

function Log($msg) {
  Write-Host "[install-helper] $msg"
}

function Test-Cmd($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

$root = Split-Path -Parent $PSScriptRoot
$mergeScript = Join-Path $root "tools\merge_server.py"

if (-not $SkipFfmpegInstall) {
  if (-not (Test-Cmd ffmpeg)) {
    if (Test-Cmd winget) {
      Log "Installing ffmpeg with winget..."
      winget install --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
    }
    elseif (Test-Cmd choco) {
      Log "Installing ffmpeg with Chocolatey..."
      choco install ffmpeg -y
    }
    else {
      throw "Could not find winget or choco. Install ffmpeg manually and re-run this script."
    }
  }
}

if (-not (Test-Cmd ffmpeg)) {
  throw "ffmpeg not found on PATH after install attempt."
}

$pythonCmd = $null
if (Test-Cmd py) {
  $pythonCmd = "py -3"
}
elseif (Test-Cmd python) {
  $pythonCmd = "python"
}
else {
  throw "Python 3 is required. Install it and rerun this script."
}

Log "Validating merge helper script..."
Invoke-Expression "$pythonCmd -m py_compile `"$mergeScript`""

Write-Host ""
Write-Host "Setup complete."
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Start merge server:"
Write-Host "   $pythonCmd `"$mergeScript`" --host 127.0.0.1 --port 8765"
Write-Host "2. In extension settings:"
Write-Host "   - Enable 'Auto-merge separate YouTube audio/video tracks'"
Write-Host "   - Set Merge Service URL to 'http://127.0.0.1:8765/merge'"
