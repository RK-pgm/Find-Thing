$ErrorActionPreference = 'Stop'

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
  & $nodeCommand.Source (Join-Path $PSScriptRoot 'server.js')
  exit $LASTEXITCODE
}

$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (Test-Path -LiteralPath $bundledNode) {
  Write-Host 'Using the Node.js runtime bundled with Codex.' -ForegroundColor DarkCyan
  & $bundledNode (Join-Path $PSScriptRoot 'server.js')
  exit $LASTEXITCODE
}

Write-Error 'Node.js was not found. Install Node.js, restart VS Code, then run this script again.'
exit 1
