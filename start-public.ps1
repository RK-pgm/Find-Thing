$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
  $nodePath = $nodeCommand.Source
} else {
  $nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $nodePath)) {
  throw 'Node.js was not found.'
}
$cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflaredCommand) {
  throw 'cloudflared was not found.'
}
$serverPath = Join-Path $projectRoot 'server.js'
$logPath = Join-Path $projectRoot 'data'
New-Item -ItemType Directory -Path $logPath -Force | Out-Null
$stdoutPath = Join-Path $logPath 'server.stdout.log'
$stderrPath = Join-Path $logPath 'server.stderr.log'
$serverProcess = Start-Process -FilePath $nodePath -ArgumentList ('"{0}"' -f $serverPath) -WorkingDirectory $projectRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    if ($serverProcess.HasExited) {
      $details = @()
      if (Test-Path -LiteralPath $stderrPath) { $details += Get-Content -LiteralPath $stderrPath -Raw }
      if (Test-Path -LiteralPath $stdoutPath) { $details += Get-Content -LiteralPath $stdoutPath -Raw }
      throw ("The web server did not start.`n" + ($details -join "`n"))
    }
    if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    throw 'The web server did not open port 3000.'
  }
  Start-Process 'http://127.0.0.1:3000'
  & $cloudflaredCommand.Source tunnel --url 'http://127.0.0.1:3000'
} finally {
  if (-not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force
  }
}
