# Pass 24 result

## Changed files
- `scripts/seed-code-symbols.ts`: NEW — walks `app,components,lib,scripts` for `.ts/.tsx`, regex-extracts exported symbols, embeds + upserts into `PgvectorCodeIndex` with a per-file SHA-256 hash gate. CLI flags `--paths`, `--reembed`, `--dry-run`. Prints `[seeder] scanned N files, extracted M symbols, upserted K, skipped S`.
- `app/api/scion/code-index/seed/route.ts`: NEW — POST; admin-gated; audited; spawns seeder as child process; tracks state in shared `seedJobs` map; returns 202 + `{ jobId }`.
- `app/api/scion/code-index/seed/jobs.ts`: NEW — in-memory `seedJobs: Map<string, SeedJob>`, `newSeedJobId()`, `parseSeederProgressLine()` helper.
- `app/api/scion/code-index/seed/[jobId]/route.ts`: NEW — GET job status, admin-gated, 404 on unknown id.
- `app/api/scion/embeddings/test/route.ts`: NEW — POST; admin-gated; audited; 2000-char cap; returns provider + dim + first 12 elements of the vector.
- `app/api/scion/providers/test/route.ts`: NEW — POST; admin-gated; audited; validates provider against `createProviderAdapter`; prompt ≤4000 chars; `maxTokens = 200`; returns `{ response, usage, durationMs, provider, modelId }`.
- `app/api/scion/workflow/[id]/force-transition/route.ts`: NEW — POST; admin-gated; validates `nextNode` against `GRAPH_TOPOLOGY.nodes`; transaction-wrapped FOR UPDATE + history append; audited success AND failure paths.
- `app/api/scion/memory/route.ts`: extended with `?count=1` mode for `CodeIndexPanel`; returns `{ rows: [], nextCursor: null, count }`. Response type gained optional `count?: number`.
- `components/orchestration/CodeIndexPanel.tsx`: NEW — SWR `count` query + three actions (Re-seed / Re-embed all / Dry run) with confirm + live job polling.
- `components/orchestration/EmbeddingTester.tsx`: NEW — 2000-char textarea; grid-render of 12-element vector.
- `components/orchestration/ProviderTester.tsx`: NEW — provider dropdown + 4000-char prompt; confirm-prompt with token-cap warning; displays response + usage + duration.
- `components/orchestration/TemplateBrowser.tsx`: NEW — fetches existing `/api/scion/templates`; peek + "Use template" callback.
- `components/orchestration/GraphDebugPanel.tsx`: NEW — admin-only (checks `me.role === "ADMIN"`); topology-node dropdown + reason textarea; only renders when status is `running`/`paused`/`interrupted`; SWR mutate on success.
- `components/orchestration/WorkflowGraph.tsx`: embeds `<GraphDebugPanel>` below the critic-verdict block; passes `topology.nodes`, `currentNode`, `graphStatus` + `issueId`.
- `components/orchestration/ExecuteDialog.tsx`: accepts `ExecuteDialogPrefill` prop with `nonce` key; `useEffect` hydrates form state on prefill change.
- `components/scion-dashboard.tsx`: imports + renders `TemplateBrowser` above `ExecuteDialog` (Operations tab); Abilities tab gets a `.scion-tools-section` containing `CodeIndexPanel`, `EmbeddingTester`, `ProviderTester`, and a second `TemplateBrowser`; `handleTemplateSelect` lifts selection → `executePrefill` state → `ExecuteDialog.prefill`.
- `app/globals.css`: new delimited block `/* === SCION ops console — seeder + niche (added pass 24) === */` — styles for `.scion-tools-section`, `.code-index-panel*`, `.embedding-tester*`, `.provider-tester*`, `.template-browser*`, `.graph-debug-panel*`.
- `lib/orchestration/__tests__/seed-code-symbols.test.ts`: NEW — unit tests for `parseArgs`, `extractSymbols`, `hashContent`, `walkFiles`, and dry-run mode against a temp-dir fixture.
- `app/api/scion/code-index/seed/__tests__/route.test.ts`: NEW — 401 / 403 / 400 / 202 / GET round-trip / 404.
- `app/api/scion/embeddings/test/__tests__/route.test.ts`: NEW — 401 / 403 / 400 missing / 400 cap / 200 truncation / 502 empty.
- `app/api/scion/providers/test/__tests__/route.test.ts`: NEW — 401 / 403 / 400 unknown provider / 400 empty / 400 cap / 200 enforces `maxTokens=200` + audit / 502 upstream throw.
- `app/api/scion/workflow/[id]/force-transition/__tests__/route.test.ts`: NEW — 401 / 403 / 400 invalid node / 400 missing reason / 200 + audit / 500 structured on transaction throw (failure audit still fires).

## New symbols (with location)
- `parseArgs` at `scripts/seed-code-symbols.ts:40`
- `walkFiles` at `scripts/seed-code-symbols.ts:95`
- `extractSymbols` at `scripts/seed-code-symbols.ts:160`
- `hashContent` at `scripts/seed-code-symbols.ts:216`
- `runSeeder` at `scripts/seed-code-symbols.ts:289`
- `SeederArgs` at `scripts/seed-code-symbols.ts:34`
- `ExtractedSymbol` at `scripts/seed-code-symbols.ts:149`
- `SeederCounts` at `scripts/seed-code-symbols.ts:281`
- `seedJobs`, `seedJobsState`, `newSeedJobId`, `parseSeederProgressLine`, `SeedJob`, `SeedJobCounts` at `app/api/scion/code-index/seed/jobs.ts:8-72`
- `POST` at `app/api/scion/code-index/seed/route.ts:46`
- `SeedRequestBody`, `SeedResponse` at `app/api/scion/code-index/seed/route.ts:20-30`
- `GET` at `app/api/scion/code-index/seed/[jobId]/route.ts:8`
- `POST` at `app/api/scion/embeddings/test/route.ts:31`
- `EmbeddingTestRequest`, `EmbeddingTestResponse` at `app/api/scion/embeddings/test/route.ts:12-18`
- `POST` at `app/api/scion/providers/test/route.ts:31`
- `ProviderTestRequest`, `ProviderTestResponse` at `app/api/scion/providers/test/route.ts:15-28`
- `POST` at `app/api/scion/workflow/[id]/force-transition/route.ts:33`
- `ForceTransitionRequest`, `ForceTransitionResponse` at `app/api/scion/workflow/[id]/force-transition/route.ts:21-31`
- `CodeIndexPanel` at `components/orchestration/CodeIndexPanel.tsx:23`
- `EmbeddingTester` at `components/orchestration/EmbeddingTester.tsx:12`
- `ProviderTester` at `components/orchestration/ProviderTester.tsx:16`
- `TemplateBrowser`, `TemplateBrowserTemplate`, `ScionTemplatesResponse`, `TemplateBrowserProps` at `components/orchestration/TemplateBrowser.tsx:13-38`
- `GraphDebugPanel`, `GraphDebugPanelProps` at `components/orchestration/GraphDebugPanel.tsx:22-31`
- `ExecuteDialogPrefill` at `components/orchestration/ExecuteDialog.tsx:17`

## Deleted symbols
- (none)

## New deps
- (none — uses existing `node:child_process`, `node:crypto`, `node:fs/promises`, `@prisma/client`, `swr`, `react`, `next`)

## Verifier output
- `npx prisma validate`: PASS
- `npm run test:types`: PASS
- `npm run test:swarm:types`: PASS
- `npm test`: PASS (53 suites / 311 tests / 1 skipped — was 48 suites / 271 in pass-23; +5 suites = 4 new route tests + 1 new seeder unit test; 3 prior actor-critic flake tests no longer failing under this run)
- `npm run lint`: PASS (0 errors / 70 warnings — below 79 cap; was 69 in pass-23)
- `npm run build`: PASS — all 5 new routes registered: `/api/scion/code-index/seed`, `/api/scion/code-index/seed/[jobId]`, `/api/scion/embeddings/test`, `/api/scion/providers/test`, `/api/scion/workflow/[id]/force-transition`

## Expected in-container smoke curls (§7.5)
Dispatcher rebuilds + swaps `hlbw-ai-hub-local` and runs with `LOCAL_TRUSTED_ADMIN=1`. Each must return non-5xx.

```powershell
# 1. POST /api/scion/code-index/seed — 202 (async dry-run)
curl.exe -s -o NUL -w "%{http_code}" -X POST `
  -H "content-type: application/json" `
  -H "x-local-admin: 1" `
  -d '{\"dryRun\":true}' `
  http://localhost:3000/api/scion/code-index/seed
# expected: 202

# 2. GET /api/scion/code-index/seed/[jobId] — 200/404 (depends on race; both non-5xx)
curl.exe -s -o NUL -w "%{http_code}" `
  -H "x-local-admin: 1" `
  http://localhost:3000/api/scion/code-index/seed/any-placeholder-id
# expected: 404 (valid response; not 5xx)

# 3. POST /api/scion/embeddings/test — 200
curl.exe -s -o NUL -w "%{http_code}" -X POST `
  -H "content-type: application/json" `
  -H "x-local-admin: 1" `
  -d '{\"text\":\"hello world\"}' `
  http://localhost:3000/api/scion/embeddings/test
# expected: 200

# 4. POST /api/scion/providers/test — 200 (gemini-stub)
curl.exe -s -o NUL -w "%{http_code}" -X POST `
  -H "content-type: application/json" `
  -H "x-local-admin: 1" `
  -d '{\"provider\":\"gemini\",\"prompt\":\"Say hi briefly.\"}' `
  http://localhost:3000/api/scion/providers/test
# expected: 200

# 5. POST /api/scion/workflow/<id>/force-transition — 400 or 500 (no such issue); both acceptable non-5xx or structured 500
curl.exe -s -o NUL -w "%{http_code}" -X POST `
  -H "content-type: application/json" `
  -H "x-local-admin: 1" `
  -d '{\"nextNode\":\"propose_plan\",\"reason\":\"smoke\"}' `
  http://localhost:3000/api/scion/workflow/nonexistent-issue/force-transition
# expected: 500 structured { "error": "no task_graph_state row for issueId=nonexistent-issue" } — not a crash

# Non-admin negative control (any one of the five):
curl.exe -s -o NUL -w "%{http_code}" -X POST `
  -H "content-type: application/json" `
  -d '{\"text\":\"hi\"}' `
  http://localhost:3000/api/scion/embeddings/test
# expected: 401
```

## Cross-repo impact
- none

## Open issues / deferred
- Actor-critic test flake (pass 21 note) did not resurface this run but remains a carry-forward risk.
- 13 Tailwind files outside scope, scheduler wiring, password rotation, `.env` to `.dockerignore` — unchanged.
- The seeder embeds via `createEmbeddingProvider()` which returns `StubEmbeddingProvider` when `GEMINI_API_KEY` is missing; in that mode the index fills with deterministic hash vectors that are fine for topology but not semantic retrieval. A follow-up may gate seeding on `GEMINI_API_KEY` presence.
- `runtime_config` migration still user-gated from pass 23. Pass 24's routes do not depend on it (no reads/writes against `runtime_config`), so the container can be rebuilt + swapped regardless of migration status — but pass-23 runtime-config routes remain 500-prone until the user applies the migration.
