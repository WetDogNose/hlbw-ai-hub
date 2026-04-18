# Migrate Project to WSL

The goal is to migrate the local development and orchestration workflow of `hlbw-ai-hub` from native Windows PowerShell to WSL (Windows Subsystem for Linux). This migration leverages the native Linux environment for better Docker performance, proper POSIX scripting, and consistency with production.

> [!NOTE]
> **Is it hard?** 
> No, it is actually quite straightforward. The project is primarily Node.js and Docker-based, both of which are platform-agnostic and arguably run *better* inside WSL. The main Windows-specific dependency is currently just the orchestrator script (`start-here.ps1`).

## Proposed Changes

### Configuration & Scripts

#### [NEW] start-here.sh
We will translate the current `start-here.ps1` into a POSIX-compliant `start-here.sh` bash script. This involves:
- Using `set -e` instead of `$ErrorActionPreference = 'Stop'`.
- Replacing `Push-Location` and `Pop-Location` with `cd ...` and subshells `(cd ... && ...)`.
- Using standard bash variable interpolation (e.g., `${PWD}`) and pulling the `.env` API key via `grep`.
- Replacing `docker ps` string comparisons with native bash conditions.

#### [DELETE] start-here.ps1
We will remove the legacy PowerShell bootstrapping script to avoid confusion about the project's canonical entry point.

#### [MODIFY] scripts/bootstrap.mjs
The development environment bootstrapper dynamically checks `process.platform === 'win32'`. When run inside WSL, `process.platform` becomes `linux`.  
We will:
- Check if WSL requires `sudo` explicitly when installing packages that normally requested `gsudo` on Windows.
- Make sure `ollama`, `gcloud`, and `VS Code extensions` checks natively integrate with Linux paths over Windows paths.

#### [MODIFY] hlbw-ai-hub.code-workspace
- Remove `"powershell.cwd": "hlbw-ai-hub"` which hard-links the root terminal to PowerShell.
- Optionally add `"terminal.integrated.defaultProfile.windows": "Ubuntu (WSL)"` to ensure VS Code seamlessly drops into bash.

## Open Questions for Preparation

> [!WARNING]
> 1. Are you using Docker Desktop with WSL 2 integration, or Docker Engine running natively inside WSL?
> 2. Have you already moved the codebase inside the `\\wsl$\...` (or `~`) directory to bypass the slow Cross-OS filesystem mounts, or are you currently accessing it from `/mnt/c/Users/`? (We strongly recommend cloning the repository directly inside the WSL file system for better performance.)

## Verification Plan

### Automated Tests
- Run `npm run test` and `npm run test:db` inside the WSL environment to confirm Javascript functionality and SQLite/Prisma bindings compile natively under Linux.

### Manual Verification
- Run `./start-here.sh`.
- Validate that all core Swarm Docker containers spin up simultaneously.
- Verify that `ollama`, `gcloud`, and `gemini` CLI tools execute successfully without OS Path mismatch errors.
