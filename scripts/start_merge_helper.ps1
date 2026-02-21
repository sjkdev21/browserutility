$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$mergeScript = Join-Path $root "tools\merge_server.py"
if (Get-Command py -ErrorAction SilentlyContinue) {
  py -3 "$mergeScript" --host 127.0.0.1 --port 8765
}
elseif (Get-Command python -ErrorAction SilentlyContinue) {
  python "$mergeScript" --host 127.0.0.1 --port 8765
}
else {
  throw "Python 3 is required."
}
