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
$toolsBin = Join-Path $root "tools\\bin"
$ytDlpLocal = Join-Path $toolsBin "yt-dlp.exe"

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
New-Item -ItemType Directory -Force -Path $toolsBin | Out-Null
Log "Downloading latest yt-dlp to $ytDlpLocal ..."
Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe" -OutFile $ytDlpLocal
if (-not (Test-Path $ytDlpLocal)) {
  throw "Failed to download local yt-dlp."
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
Write-Host "   powershell -ExecutionPolicy Bypass -File .\\scripts\\start_merge_helper.ps1"
Write-Host "2. In extension settings:"
Write-Host "   - Enable 'Auto-merge separate YouTube audio/video tracks'"
Write-Host "   - Set Merge Service URL to 'http://127.0.0.1:8765/merge'"
