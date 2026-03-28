# MCP Server Health Validation

## Overview
The toolchain-doctor now validates that all MCP server entry-point files referenced in the Antigravity MCP config actually exist on disk. Additionally, the `hlbw-tester` MCP server's working directory resolution has been fixed to reliably derive the project root from `import.meta.url` rather than depending on `process.cwd()`.

## Problem
When the Antigravity IDE launches MCP servers, `process.cwd()` resolves to the IDE's install directory (`C:\Users\Jason\AppData\Local\Programs\Antigravity\`), not the project repository. The `hlbw-tester` relied on `process.cwd()` to find `package.json` for running npm scripts, causing all test commands to fail.

## Solution

### `mcp-tester.mjs`
- Added `import.meta.url` based `__dirname` derivation
- `PROJECT_ROOT = path.resolve(__dirname, '..')` gives a reliable repo root
- All `execAsync` calls now use `{ cwd: PROJECT_ROOT }` instead of `process.cwd()`

### `toolchain-doctor.js`
- Added step 7: **MCP Server Health Validation**
- Reads `~/.gemini/antigravity/mcp_config.json` and checks each server's entry-point file exists
- Differentiates between local script servers (validates file existence) and npx-based servers (validates registration only)
- Reports errors for any missing entry-points

## Files Modified
- `scripts/mcp-tester.mjs` — Fixed cwd resolution
- `scripts/toolchain-doctor.js` — Added health validation step
- `.agents/skills/toolchain-doctor/SKILL.md` — Documented the new capability
- `GEMINI.md` — Added feature checklist entry
