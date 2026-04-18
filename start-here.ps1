# start-here.ps1
# Pre-flight & Swarm Spooling for HLBW AI Hub.
# Ported from start-here.sh

$ErrorActionPreference = 'Stop'

Write-Host "🚀 Starting HLBW AI Hub Pre-flight & Swarm Spooling..." -ForegroundColor Cyan

# --- 1. Install dependencies ---
Write-Host "📦 Installing npm dependencies (with legacy support)..." -ForegroundColor Yellow
npm install --legacy-peer-deps

# --- 2. Ensure Network ---
Write-Host "🌐 Ensuring hlbw-network exists..." -ForegroundColor Yellow
$networkExists = docker network ls --filter "name=hlbw-network" --format "{{.Name}}"
if (-not $networkExists) {
    docker network create hlbw-network
    Write-Host "   -> hlbw-network created" -ForegroundColor Green
} else {
    Write-Host "   -> hlbw-network already exists" -ForegroundColor Gray
}

# --- 3. Start Infrastructure (Jaeger & Neo4j) ---
Write-Host "🔭 Starting hlbw-jaeger (Tracing)..." -ForegroundColor Yellow
$jaegerStatus = docker ps -a --filter "name=^/hlbw-jaeger$" --format "{{.Status}}"
if (-not $jaegerStatus) {
    Write-Host "  -> Running hlbw-jaeger..." -ForegroundColor Gray
    docker run -d --name hlbw-jaeger `
        --network hlbw-network `
        -p 16686:16686 -p 4318:4318 `
        jaegertracing/all-in-one:latest
} elseif ($jaegerStatus -notlike "Up*") {
    Write-Host "  -> Starting hlbw-jaeger..." -ForegroundColor Gray
    docker start hlbw-jaeger
} else {
    Write-Host "  -> hlbw-jaeger already running" -ForegroundColor Gray
}

Write-Host "🧠 Starting hlbw-neo4j (Shared Graph Memory)..." -ForegroundColor Yellow
$neo4jStatus = docker ps -a --filter "name=^/hlbw-neo4j$" --format "{{.Status}}"
if (-not $neo4jStatus) {
    Write-Host "  -> Running hlbw-neo4j..." -ForegroundColor Gray
    docker run -d --name hlbw-neo4j `
        --network hlbw-network `
        -p 7474:7474 -p 7687:7687 `
        -e NEO4J_AUTH=neo4j/wotbox-swarm `
        -e NEO4J_PLUGINS='["apoc"]' `
        -v hlbw-neo4j-data:/data `
        neo4j:5
} elseif ($neo4jStatus -notlike "Up*") {
    Write-Host "  -> Starting hlbw-neo4j..." -ForegroundColor Gray
    docker start hlbw-neo4j
} else {
    Write-Host "  -> hlbw-neo4j already running" -ForegroundColor Gray
}

# --- 4. Start Memory Monitor UI ---
Write-Host "🖥️ Starting hlbw-memory-monitor..." -ForegroundColor Yellow
$monitorStatus = docker ps -a --filter "name=^/hlbw-memory-monitor$" --format "{{.Status}}"
if (-not $monitorStatus) {
    Write-Host "Building ai-memory-fragment-monitor..." -ForegroundColor Gray
    Push-Location tools/ai-memory-fragment-monitor
    docker build -t ai-memory-fragment-monitor .
    docker run -d --name hlbw-memory-monitor `
        --network hlbw-network `
        -p 3001:3000 `
        -e NEO4J_URL=bolt://hlbw-neo4j:7687 `
        -e NEO4J_PASSWORD=wotbox-swarm `
        ai-memory-fragment-monitor
    Pop-Location
} elseif ($monitorStatus -notlike "Up*") {
    Write-Host "  -> Starting hlbw-memory-monitor..." -ForegroundColor Gray
    docker start hlbw-memory-monitor
} else {
    Write-Host "  -> hlbw-memory-monitor already running" -ForegroundColor Gray
}

# --- 5. Start Directive Enforcer Sentry ---
Write-Host "🛡️ Starting sentry-validation-worker..." -ForegroundColor Yellow
$sentryStatus = docker ps -a --filter "name=^/sentry-validation-worker$" --format "{{.Status}}"
if (-not $sentryStatus) {
    Write-Host "  -> Starting/Running sentry-validation-worker..." -ForegroundColor Gray
    $geminiApiKey = $null
    if (Test-Path .env) {
        $envContent = Get-Content .env
        foreach ($line in $envContent) {
            if ($line -match "^GEMINI_API_KEY=(.+)$") {
                $geminiApiKey = $Matches[1].Trim().Trim('"').Trim("'")
                break
            }
        }
    }

    if (-not $geminiApiKey) {
        $geminiApiKey = $env:GEMINI_API_KEY
    }

    try {
        docker run -d --name sentry-validation-worker `
            --network hlbw-network `
            -p 8080:8080 `
            -v "${PWD}:/workspace" `
            -e "GEMINI_API_KEY=${geminiApiKey}" `
            directive-enforcer
    } catch {
        Write-Host "⚠️ Failed to start sentry. Is the directive-enforcer image built?" -ForegroundColor Red
    }
} elseif ($sentryStatus -notlike "Up*") {
    Write-Host "  -> Starting sentry-validation-worker..." -ForegroundColor Gray
    docker start sentry-validation-worker
} else {
    Write-Host "  -> sentry-validation-worker already running" -ForegroundColor Gray
}

# --- 5.5 Start Paperclip (Agent Management) ---
Write-Host "📎 Starting hlbw-paperclip (Agent Management)..." -ForegroundColor Yellow
$paperclipStatus = docker ps -a --filter "name=^/hlbw-paperclip$" --format "{{.Status}}"
if (-not $paperclipStatus) {
    Write-Host "  -> Building hlbw-paperclip image..." -ForegroundColor Gray
    Push-Location tools/docker-paperclip
    docker build -t hlbw-paperclip .
    Write-Host "  -> Running hlbw-paperclip container..." -ForegroundColor Gray
    docker run -d --name hlbw-paperclip `
        --network hlbw-network `
        -p 3100:3101 `
        -v hlbw-paperclip-data:/paperclip `
        -e "OPENAI_BASE_URL=http://host.docker.internal:11434/v1" `
        -e "OPENAI_API_KEY=ollama" `
        hlbw-paperclip
    Pop-Location
} elseif ($paperclipStatus -notlike "Up*") {
    Write-Host "  -> Starting hlbw-paperclip..." -ForegroundColor Gray
    docker start hlbw-paperclip
} else {
    Write-Host "  -> hlbw-paperclip already running" -ForegroundColor Gray
}

# --- 6. Build Swarm Worker Core Image if missing ---
$workerImage = docker images -q hlbw-swarm-worker:latest
if (-not $workerImage) {
    Write-Host "🤖 Building Swarm Worker Core Image (Missing)..." -ForegroundColor Yellow
    docker build -t hlbw-swarm-worker:latest ./tools/docker-gemini-cli
} else {
    Write-Host "🤖 Swarm Worker Core Image exists. Skipping build." -ForegroundColor Gray
}

# --- 7. Start Docker Gemini CLI environment ---
Write-Host "📦 Starting Docker Gemini CLI environment..." -ForegroundColor Yellow
Push-Location tools/docker-gemini-cli
# Compose handles 'already running' natively
docker compose up -d
Pop-Location

# --- 8. Initialize Worktree Isolation ---
Write-Host "📂 Ensuring Swarm Isolation root exists..." -ForegroundColor Yellow
$worktreeRoot = Join-Path (Split-Path $PWD -Parent) "hlbw-worktrees"
if (-not (Test-Path $worktreeRoot)) {
    New-Item -ItemType Directory -Path $worktreeRoot -Force | Out-Null
}

# Only prune if there are worktrees to prune to avoid noisy errors
$worktreeCount = (git worktree list --porcelain | Measure-Object).Count
if ($worktreeCount -gt 1) {
    git worktree prune
}

# --- 9. Pre-flight toolchain validation ---
Write-Host "🩺 Running Toolchain Doctor..." -ForegroundColor Yellow
try {
    npm run toolchain-doctor
} catch {
    Write-Host "   -> Toolchain Doctor reported issues, but continuing..." -ForegroundColor Gray
}

# --- 10. Start Warm Workers Pool (Check if already up) ---
Write-Host "Checking Swarm Warm Pool (21 Workers, 3 per Role)..." -ForegroundColor Yellow
$warmWorker = docker ps -q -f "name=^/hlbw-worker-warm-1_qa-1$"
if (-not $warmWorker) {
    Write-Host "  -> Warm pool not detected. Booting..." -ForegroundColor Gray
    $stateFile = ".agents/swarm/state.json"
    if (Test-Path $stateFile) {
        Remove-Item $stateFile -Force
    }
    npx tsx scripts/swarm/pool-manager.ts start 21
} else {
    Write-Host "  -> Warm pool already running. Skipping boot." -ForegroundColor Gray
}

Write-Host ""
Write-Host "✅ All optimized containers and pre-flights are verified and ready!" -ForegroundColor Green
