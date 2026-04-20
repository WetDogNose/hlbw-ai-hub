# Pass 23 result

**ESCALATE required before pass 24**

The user must apply the drafted migration before the pass-24 dispatcher rebuilds any container image. Command:

```
npx prisma migrate dev --name runtime_config
```

The new routes that read/write `runtime_config` will 500 in a container until the migration is applied (loader tolerates the missing table and falls back to env+default so the app still boots, but writes throw with "runtime_config table missing").

## Changed files
- prisma/schema.prisma: adds `RuntimeConfig` model (key/value/updatedAt/updatedBy, `@@map("runtime_config")`).
- prisma/migrations/20260420132133_runtime_config/migration.sql: drafted migration; header note bans auto-apply.
- lib/orchestration/runtime-config.ts: new loader — `getRuntimeConfig`, `setRuntimeConfig`, `listRuntimeConfig`, `validateRuntimeConfigValue`, `RuntimeConfigKey` type, hardcoded defaults + env mapping.
- app/api/scion/runtime-config/route.ts: GET list (admin-only).
- app/api/scion/runtime-config/[key]/route.ts: PUT single key (admin-only, validated, audited).
- app/api/scion/budget/route.ts: GET aggregation by task|model|day with from/to filters (admin-only).
- app/api/scion/traces/route.ts: extended to accept `status`, `category`, `from`, `to` filters; preserves behavior when absent. Pulls Issue.agentCategory post-hoc when category filter present.
- app/api/scion/memory/search/route.ts: POST similarity search via embedding provider + MemoryStore (admin-only).
- app/api/scion/memory/[id]/route.ts: DELETE memory episode (admin-only, audited).
- app/api/scion/mcp/[server]/tools/route.ts: GET MCP tools/list with 60s in-memory cache, whitelisted against `.gemini/mcp.json` (admin-only).
- components/orchestration/RuntimeConfigPanel.tsx: table editor with type-aware input (number/JSON); saves via PUT, SWR mutate on success.
- components/orchestration/BudgetBreakdown.tsx: three inline-SVG bar charts (task/model/day) with datetime-local range controls.
- components/orchestration/TraceFilters.tsx: status/category/from/to controls + `traceJaegerUrl(taskId)` helper.
- components/orchestration/TraceSidebar.tsx: accepts new filter props; renders "Open in Jaeger" link per row.
- components/orchestration/MemorySearch.tsx: text+kind+limit form → POST /api/scion/memory/search; similarity results with distance.
- components/orchestration/MCPToolBrowser.tsx: lists servers from /api/scion/config; lazy-loads tools per server on expand.
- components/orchestration/MemoryBrowser.tsx: adds per-row admin-only Delete button gated by `window.confirm`; SWR mutate on success.
- components/scion-dashboard.tsx: wires BudgetBreakdown (Operations), TraceFilters (Workflow), RuntimeConfigPanel + MCPToolBrowser (Abilities), MemorySearch (Memory). Lifts trace filter state; derives category options from issues.
- app/globals.css: new delimited block `/* === SCION ops console — config + analytics (added pass 23) === */` with all new semantic classes; zero Tailwind utilities.

## New symbols (with location)
- `model RuntimeConfig` at prisma/schema.prisma:313
- `RuntimeConfigKey` at lib/orchestration/runtime-config.ts:19
- `RUNTIME_CONFIG_KEYS` at lib/orchestration/runtime-config.ts:25
- `RuntimeConfigEffective<K>` at lib/orchestration/runtime-config.ts:33
- `validateRuntimeConfigValue` at lib/orchestration/runtime-config.ts:101
- `getRuntimeConfig` at lib/orchestration/runtime-config.ts:234
- `setRuntimeConfig` at lib/orchestration/runtime-config.ts:263
- `listRuntimeConfig` at lib/orchestration/runtime-config.ts:301
- `getHardcodedDefault` at lib/orchestration/runtime-config.ts:315
- `getEnvName` at lib/orchestration/runtime-config.ts:319
- `ScionRuntimeConfigResponse` at app/api/scion/runtime-config/route.ts:10
- `GET /api/scion/runtime-config` handler at app/api/scion/runtime-config/route.ts:16
- `PUT /api/scion/runtime-config/[key]` handler at app/api/scion/runtime-config/[key]/route.ts:22
- `BudgetGroupBy` at app/api/scion/budget/route.ts:17
- `BudgetBreakdownRow` at app/api/scion/budget/route.ts:19
- `ScionBudgetResponse` at app/api/scion/budget/route.ts:25
- `GET /api/scion/budget` handler at app/api/scion/budget/route.ts:36
- `MemorySearchRow` at app/api/scion/memory/search/route.ts:13
- `ScionMemorySearchResponse` at app/api/scion/memory/search/route.ts:24
- `POST /api/scion/memory/search` handler at app/api/scion/memory/search/route.ts:43
- `DELETE /api/scion/memory/[id]` handler at app/api/scion/memory/[id]/route.ts:13
- `ScionMcpToolEntry` at app/api/scion/mcp/[server]/tools/route.ts:17
- `ScionMcpToolsResponse` at app/api/scion/mcp/[server]/tools/route.ts:22
- `__clearMcpToolsCache` at app/api/scion/mcp/[server]/tools/route.ts:66
- `GET /api/scion/mcp/[server]/tools` handler at app/api/scion/mcp/[server]/tools/route.ts:72
- `RuntimeConfigPanel` (default export) at components/orchestration/RuntimeConfigPanel.tsx:162
- `BudgetBreakdown` (default export) at components/orchestration/BudgetBreakdown.tsx:75
- `TraceFilters` (default export) at components/orchestration/TraceFilters.tsx:43
- `TraceFilterValues` at components/orchestration/TraceFilters.tsx:15
- `traceJaegerUrl` at components/orchestration/TraceFilters.tsx:36
- `MemorySearch` (default export) at components/orchestration/MemorySearch.tsx:22
- `MCPToolBrowser` (default export) at components/orchestration/MCPToolBrowser.tsx:65

## Deleted symbols
- (none)

## New deps
- (none)

## Verifier output
- npx prisma validate: PASS
- npm run test:types: PASS
- npm run test:swarm:types: PASS
- npm test: 47 suites PASSED / 1 pre-existing actor-critic flake (unchanged from pass 22), 271 tests passed / 3 failed (all in actor-critic flake), 1 skipped. New this pass: 7 route/loader suites (runtime-config loader + 5 route tests + 1 memory delete).
- npm run lint: PASS (0 errors / 69 warnings ≤ 79 ceiling; +1 vs pass 22 from non-scope files)
- npm run build: PASS (all new routes visible in route manifest)

## Open issues / deferred
- Migration not applied — user must run `npx prisma migrate dev --name runtime_config` before pass-24 rebuilds the container image. Writes via `setRuntimeConfig` will throw "runtime_config table missing" until applied. Reads tolerate the missing table and fall back to env/default.
- Pass 22's pre-existing actor-critic test flake still present (3 timeouts). Not addressed this pass per scope.
- Container image NOT rebuilt+swapped this pass (per spec). In-container smoke test deferred until after user applies the migration.
- Budget "model" groupBy aggregates on `AgentPersona.role` as a proxy — `BudgetLedger` has no model column per checkpoint-15 invariants. A richer model dimension would require a schema change and is out of scope.
- `.env.example` not updated with new SCION_* env fallbacks (`SCION_CYCLE_CAP`, `SCION_CONFIDENCE_THRESHOLD`, `SCION_EXPLORATION_BUDGET`, `SCION_WATCHDOG_TIMEOUT_MINUTES`); loader reads them only when present so defaults stay safe.

## Cross-repo impact
- none
