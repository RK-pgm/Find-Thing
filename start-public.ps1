$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$port = 3000
$localUrl = "http://127.0.0.1:$port"
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
$serverProcess = $null
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  try {
    $response = Invoke-WebRequest -Uri $localUrl -TimeoutSec 3
    if ($response.StatusCode -ne 200 -or $response.Content -notmatch 'Found It') {
      throw "Port $port is already used by another service. Stop that service, then run this script again."
    }
    Write-Host "Using the existing Find thing server at $localUrl" -ForegroundColor DarkCyan
  } catch {
    throw "Could not use the service already listening on port $port. $($_.Exception.Message)"
  }
} else {
  $dataPath = Join-Path $projectRoot 'data'
  New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
  $stdoutPath = Join-Path $dataPath 'server.stdout.log'
  $stderrPath = Join-Path $dataPath 'server.stderr.log'
  $serverPath = Join-Path $projectRoot 'server.js'
  $serverProcess = Start-Process -FilePath $nodePath -ArgumentList ('"{0}"' -f $serverPath) -WorkingDirectory $projectRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    if ($serverProcess.HasExited) {
      $details = @()
      if (Test-Path -LiteralPath $stderrPath) { $details += Get-Content -LiteralPath $stderrPath -Raw }
      if (Test-Path -LiteralPath $stdoutPath) { $details += Get-Content -LiteralPath $stdoutPath -Raw }
      throw ("The web server did not start.`n" + ($details -join "`n"))
    }
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    throw "The web server did not open port $port."
  }
  Write-Host "Started Find thing at $localUrl" -ForegroundColor DarkCyan
}
try {
  Start-Process $localUrl
  & $cloudflaredCommand.Source tunnel --url $localUrl
} finally {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force
  }
}
