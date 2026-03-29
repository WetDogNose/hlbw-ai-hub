# // turbo-all

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

Write-Host "Building hlbw-swarm-worker:latest..."
docker build -t hlbw-swarm-worker:latest -f scripts/swarm/Dockerfile.swarm-worker .

if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker build failed with exit code $LASTEXITCODE."
    exit $LASTEXITCODE
}

Write-Host "hlbw-swarm-worker:latest build complete."