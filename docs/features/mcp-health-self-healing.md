# MCP Health Self-Healing

## Overview
Added self-healing checks to the Toolchain Doctor to prevent two recurring MCP health issues from regressing.

## Issue 1: Vitest Type Errors in Swarm Tests
**Root cause:** `tsconfig.json` included `**/*.ts` which picked up `scripts/swarm/__tests__/*.test.ts` — these files import `vitest`, which is not installed in the main project (the swarm subsystem runs standalone in Docker containers).

**Fix:** Added `scripts/swarm/__tests__` to the `exclude` array in `tsconfig.json`.

**Self-healing:** The toolchain doctor now checks that this exclusion exists and auto-adds it if missing.

## Issue 2: Stale `next.config.mjs` Reference
**Root cause:** The `infrastructure-analyzer` MCP server hardcoded `next.config.mjs`, but the project renamed its config to `next.config.ts`.

**Fix:** Updated the MCP source to auto-detect the config file extension (`.ts`, `.mjs`, `.js`).

**Self-healing:** The toolchain doctor now verifies that the infrastructure-analyzer source references a filename that actually exists on disk.

## Files Modified
- `tsconfig.json` — Added swarm test exclusion
- `.agents/mcp-servers/infrastructure-analyzer/src/index.ts` — Auto-detect next.config extension
- `.agents/mcp-servers/infrastructure-analyzer/dist/index.js` — Compiled output
- `scripts/toolchain-doctor.js` — Two new self-healing checks (sections 8 and 9)
- `.agents/skills/toolchain-doctor/SKILL.md` — Documented new checks
