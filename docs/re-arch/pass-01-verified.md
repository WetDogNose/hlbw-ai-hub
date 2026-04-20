# Pass 01 verified

**Cycles**: 2 (1 REWORK). **Verdict**: PASS.

## What's now true
- `docs/re-arch/INVENTORY.md` is the source-of-truth map for every subsystem: swarm (A), SCION (B), paperclip (C), MCP servers (D), wrappers/templates (E), skills/workflows (F), Prisma (G), root cruft (H). 108 files covered.
- Dead-code candidates: **16 code + 8 root cruft** after broadened Grep (original count was 20 + 8; the first pass missed refs from `.ps1`/`.sh`/`Dockerfile*`/MCP configs/`.agents/*.md` turbo blocks).
- 4 files moved Dead → Live in rework cycle 1: `scripts/swarm/pool-manager.ts` (via `start-here.ps1:184`), `scripts/swarm/watchdog.ts` (via `.agents/workflows/master-agent-coordinator.md:49`), `scripts/mcp-dynamic-postgres.mjs` (via `tools/docker-gemini-cli/configs/category-4-db/mcp_config.json`), `.agents/mcp-servers/infrastructure-analyzer/` (via category-1-qa MCP config + `scripts/toolchain-doctor.js:293`).
- Test gate on main: `test:types` PASS, `test:swarm:types` PASS, `npm test` PASS (2 suites / 5 tests), `lint` FAIL (1 error + 82 warnings — pre-existing, pass 2's job).

## Frozen this pass
- Dead-code Grep scope contract: must include `.ts/.tsx/.js/.mjs/.cjs/.py/.ps1/.sh/.cmd/.bat/Dockerfile*`, `cloudbuild.yaml`, `.github/workflows/*`, `package.json` scripts, any `mcp_config.json`, `.agents/**/*.md` turbo blocks. Any future deletion pass MUST re-run with this scope.
- `agent-runner.ts` has transitive live consumers: `pool-manager.ts:95` → `start-here.ps1:184`, plus `Dockerfile.swarm-worker`.

## Open carry-forward
- Pass 2 targets: fix `app/admin/stats/client.tsx:22` (preserve-caught-error) and resolve the `vitest` import in `scripts/swarm/__tests__/{arbiter,state}.test.ts` (package not in devDeps; tests run under Jest).
- 16 code + 8 root-cruft dead-code candidates deferred to pass 20. Each must be re-greped at deletion time per the frozen scope contract above.
- `lib/orchestration/db-sync.ts` confirmed zero live callers — deferred to pass 20.
