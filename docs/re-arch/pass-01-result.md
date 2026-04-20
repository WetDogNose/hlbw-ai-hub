# Pass 01 result

## Changed files
- `docs/re-arch/INVENTORY.md`: created — source-of-truth inventory of every subsystem (swarm, SCION, paperclip, MCP, wrappers/templates, skills/workflows, Prisma, root cruft).
- `docs/re-arch/INVENTORY.md`: updated (rework cycle 1 — broadened dead-code verification Grep, reclassified `pool-manager.ts`, `watchdog.ts`, `scripts/mcp-dynamic-postgres.mjs`, and `.agents/mcp-servers/infrastructure-analyzer/` from Dead to Live; re-derived the `agent-runner.ts` live-consumer chain; revised summary tally from 20 → 16 code-level dead-code candidates).

## New symbols (with location)
- (none — Pass 1 is read-only per `PLAN.md` §3 Pass 1 spec.)

## Deleted symbols
- (none — Pass 1 is read-only.)

## New deps
- (none.)

## Verifier output
- `npm run test:types`: PASS (exit 0; memory-tracker log `logs/memory-tracker-2026-04-19T23-54-57-435Z.log`).
- `npm run test:swarm:types`: PASS (exit 0; memory-tracker log `logs/memory-tracker-2026-04-19T23-57-52-788Z.log`).
- `npm test`: PASS (2 suites, 5 tests, 0 new; memory-tracker log `logs/memory-tracker-2026-04-19T23-58-21-188Z.log`).
- `npm run lint`: FAIL on `main` baseline — 1 error + 82 warnings. Error: `app/admin/stats/client.tsx:22:7  preserve-caught-error — There is no cause attached to the symptom error being thrown`. Error pre-exists Pass 1 (no file edits this pass). Warnings are `@typescript-eslint/no-unused-vars` across `scripts/swarm/*` files and pre-exist Pass 1.

## Open issues / deferred
- Lint error at `app/admin/stats/client.tsx:22` is a baseline failure for Pass 2 to resolve per the `PLAN.md` §3 Pass 2 "Test floor" goal.
- `scripts/swarm/__tests__/arbiter.test.ts` and `state.test.ts` import from `vitest`, but `vitest` is not in `package.json` devDependencies. Jest runs them via `ts-jest`; the `vitest` import resolves because the identifier subset (`describe`, `expect`, `it`, `vi`, `beforeEach`) overlaps with Jest globals, yet the import itself will break if the package is not present. Flag for Pass 2 inspection.
- `lib/orchestration/db-sync.ts` is reachable only as a dead-code candidate — no live inbound refs. Deletion deferred to Pass 20 per `PLAN.md` §3.
- 16 code-level dead-code candidates and 8 root-cruft artifacts identified (see INVENTORY.md §"Dead-code candidates"). All deletions deferred to Pass 20 pending per-file re-grep.
- `.agents/mcp-servers/infrastructure-analyzer/` is built (`dist/index.js` present) and wired in `tools/docker-gemini-cli/configs/category-1-qa/mcp_config.json:12` — Live, not a dead-code candidate.
- `wrappers/` and `templates/` are reference-only (zero runtime imports). Keep per `PLAN.md` §5 ("Does not rewrite the MCP wrappers in `wrappers/a2a/` or `wrappers/mcp/`").
- `scratch/dispatch-cloud-agent.ts` imports from `scripts/swarm/docker-worker`; review under Pass 20 cull.

## Cross-repo impact
- none. `app/api/scion/templates/route.ts` reads from a sibling-repo path `../ai-organisation-engine/.scion/templates` at runtime, but no edits were made to any sibling repo in this pass.
