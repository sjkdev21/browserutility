$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$mergeScript = Join-Path $root "tools\merge_server.py"
$ytDlpLocal = Join-Path $root "tools\bin\yt-dlp.exe"

if (-not (Test-Path $ytDlpLocal)) {
  throw "Local yt-dlp binary not found at $ytDlpLocal. Run .\\scripts\\install_helper.ps1 first."
}

if (Get-Command py -ErrorAction SilentlyContinue) {
  py -3 "$mergeScript" --host 127.0.0.1 --port 8765 --yt-dlp "$ytDlpLocal"
}
elseif (Get-Command python -ErrorAction SilentlyContinue) {
  python "$mergeScript" --host 127.0.0.1 --port 8765 --yt-dlp "$ytDlpLocal"
}
else {
  throw "Python 3 is required."
}
