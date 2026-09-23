[CmdletBinding()]
param(
  [string]$EnvironmentFile = ".env.demo.example"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $projectRoot "compose.demo.yml"
$resolvedEnvironmentFile = Join-Path $projectRoot $EnvironmentFile

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is not installed or is not available in PATH."
}
if (-not (Test-Path -LiteralPath $resolvedEnvironmentFile)) {
  throw "Demo environment file was not found: $resolvedEnvironmentFile"
}
Push-Location $projectRoot
try {
  docker compose --env-file $resolvedEnvironmentFile -f $composeFile up --build --detach
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose deployment failed."
  }

  $deadline = (Get-Date).AddMinutes(5)
  do {
    try {
      $response = Invoke-WebRequest `
        -Uri "http://127.0.0.1:3009/api/health/ready" `
        -TimeoutSec 5 `
        -SkipHttpErrorCheck `
        -NoProxy
      if ($response.StatusCode -eq 200) {
        Write-Output "Demo is ready at http://172.20.40.214:3009"
        exit 0
      }
    } catch {
      # The app or database can still be starting.
    }
    Start-Sleep -Seconds 5
  } while ((Get-Date) -lt $deadline)

  docker compose --env-file $resolvedEnvironmentFile -f $composeFile ps
  throw "Deployment started, but readiness did not become healthy within five minutes."
} finally {
  Pop-Location
}
