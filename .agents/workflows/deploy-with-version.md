---
description: Deploy the application to production with version tracking
swarm-safe: true
---
// turbo-all

This workflow automates the process of tagging the current deployment with the Git commit hash and deploying the application to Google Cloud Run via GitHub.

## Swarm Delegation

This workflow is **explicitly approved for autonomous execution** by swarm workers. All git-mutating operations (`git add`, `git commit`, `git tag`, `git push`) are marked as safe-to-auto-run, whether executed individually or via a wrapper script. A delegated worker agent MUST set `SafeToAutoRun: true` on every `run_command` step or when invoking the main deployment script (e.g., `scripts/deploy-production.ps1`) without requiring human confirmation.

## Phase 1: Pre-flight Checks

1. Check for uncommitted changes (this will fail if you have unstaged changes)
// turbo
```powershell
git diff-index --quiet HEAD
```

*(Note: Prisma database migrations are now handled automatically by the `cloudbuild.yaml` CI/CD pipeline after the new container is built, effectively resolving previous race conditions.)*

## Phase 2: Version Stamping

2. Get the current Git commit hash and map it to a variable
// turbo
```powershell
$gitHash = git rev-parse --short HEAD
```

3. Write the Git hash to `public/version.txt`
// turbo
```powershell
Set-Content -Path public/version.txt -Value $gitHash
```

5. Stage the version file — **SafeToAutoRun: true** (non-destructive git add)
// turbo
```powershell
git add public/version.txt
```

6. Commit the version file update — **SafeToAutoRun: true** (safe, scoped commit of version stamp only)
// turbo
```powershell
git commit --allow-empty --no-verify -m "chore: bump version to $gitHash for deployment"
```

## Phase 3: Deploy

7. Tag and push to trigger Cloud Build deployment — **SafeToAutoRun: true** (approved deployment action)
// turbo
```powershell
git tag -f prod-build && git push origin master && git push origin prod-build --force
```

**CRITICAL NOTE:** Google Cloud Build is explicitly configured to ONLY trigger a deployment when the `prod-build` tag is pushed. Standard commits to `master` will not trigger a build.

> [!TIP]
> **Agent Efficiency Hint:** After triggering the deployment, use the `read_gcp_logs` tool from `gcp-logging-mcp` or tools from `gcp-trace-mcp` to autonomously verify the Cloud Build pipeline succeeded or diagnose any production issues quickly, rather than waiting for the user to check or using slow CLI commands.
