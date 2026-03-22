#!/usr/bin/env pwsh
# // turbo-all
# deploy-production.ps1
# Self-contained production deployment script for Wot-Box.
# Designed to be dispatched by swarm workers or run interactively.
# All steps execute sequentially with automatic error handling.

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Wot-Box Production Deployment" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# ── Phase 1: Pre-flight Checks ──────────────────────────────────────────────

Write-Host "[Phase 1] Pre-flight Checks" -ForegroundColor Yellow

# Step 1: Ensure clean working tree
Write-Host "  Checking for uncommitted changes..."
git diff-index --quiet HEAD
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Uncommitted changes detected. Commit or stash before deploying." -ForegroundColor Red
    exit 1
}
Write-Host "  Working tree is clean." -ForegroundColor Green

# Step 2: Schema migration check
Write-Host "  Checking for Prisma schema changes since last deployment..."
$schemaChanged = git diff prod-build HEAD --name-only | Select-String "prisma/schema.prisma"
if ($schemaChanged) {
    Write-Host "  Schema change detected. Running GCP schema migration..." -ForegroundColor Yellow
    $IMAGE = gcloud run services describe wot-box --region=asia-southeast1 --format="value(spec.template.spec.containers[0].image)"

    # Generate YAML config to avoid PowerShell gcloud --args quoting bug
    # (gcloud on PowerShell collapses comma-separated args into a single string)
    $yamlPath = Join-Path $PSScriptRoot "..\tmp\migrate-job-auto.yaml"
    @"
apiVersion: run.googleapis.com/v1
kind: Job
metadata:
  name: wot-box-db-migrate
  labels:
    cloud.googleapis.com/location: asia-southeast1
  annotations:
    run.googleapis.com/cloudsql-instances: wot-box:asia-southeast1:wot-box-db-instance
    run.googleapis.com/execution-environment: gen2
spec:
  template:
    metadata:
      annotations:
        run.googleapis.com/cloudsql-instances: wot-box:asia-southeast1:wot-box-db-instance
    spec:
      taskCount: 1
      template:
        spec:
          maxRetries: 3
          timeoutSeconds: "600"
          containers:
            - image: $IMAGE
              command:
                - "node"
              args:
                - "node_modules/prisma/build/index.js"
                - "db"
                - "push"
                - "--accept-data-loss"
                - "--skip-generate"
              env:
                - name: DATABASE_URL
                  value: "postgresql://wot_box_user:defaultpassword@localhost:5432/wot_box_db?host=/cloudsql/wot-box:asia-southeast1:wot-box-db-instance&connection_limit=2"
              resources:
                limits:
                  cpu: "1000m"
                  memory: 512Mi
"@ | Set-Content -Path $yamlPath -Encoding utf8

    gcloud run jobs replace $yamlPath --region=asia-southeast1
    gcloud run jobs execute wot-box-db-migrate --region=asia-southeast1 --wait
    Remove-Item $yamlPath -ErrorAction SilentlyContinue
    Write-Host "  GCP schema migration complete." -ForegroundColor Green
} else {
    Write-Host "  No schema changes detected. Migration skipped." -ForegroundColor Green
}

# ── Phase 2: Version Stamping ────────────────────────────────────────────────

Write-Host "`n[Phase 2] Version Stamping" -ForegroundColor Yellow

# Step 3: Get current git hash
$gitHash = git rev-parse --short HEAD
Write-Host "  Current commit hash: $gitHash"

# Step 4: Write version file
Set-Content -Path public/version.txt -Value $gitHash
Write-Host "  Wrote hash to public/version.txt" -ForegroundColor Green

# Step 5: Stage version file
git add public/version.txt
Write-Host "  Staged public/version.txt" -ForegroundColor Green

# Step 6: Commit version bump
git commit --allow-empty -m "chore: bump version to $gitHash for deployment"
Write-Host "  Committed version bump." -ForegroundColor Green

# ── Phase 3: Deploy ──────────────────────────────────────────────────────────

Write-Host "`n[Phase 3] Deploy" -ForegroundColor Yellow

# Step 7: Tag and push
git tag -f prod-build
Write-Host "  Tagged prod-build" -ForegroundColor Green

git push origin master
Write-Host "  Pushed master" -ForegroundColor Green

git push origin prod-build --force
Write-Host "  Force-pushed prod-build tag" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Deployment triggered successfully!" -ForegroundColor Cyan
Write-Host "  Cloud Build will pick up the prod-build tag." -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan
