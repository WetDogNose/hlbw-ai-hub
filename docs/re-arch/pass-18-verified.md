# Pass 18 verified

**Cycles**: 1. **Verdict**: PASS.

## What's now true
- `lib/orchestration/tracing/attrs.ts` defines canonical `SPAN_ATTR` (13 keys: TASK_ID, AGENT_CATEGORY, ROLE, NODE, NODE_OUTCOME, MODEL_ID, PROVIDER, CYCLE, RUBRIC_NAME, CONFIDENCE, VERDICT, INPUT_TOKENS, OUTPUT_TOKENS).
- `StateGraph.transition` wraps in `startActiveSpan("Graph:<node>")` with standard attributes, `span.end()` in finally.
- Role spans: `Actor:propose`, `Critic:evaluate` (sets VERDICT + CONFIDENCE), `Orchestrator:loop` (CYCLE). `Explorer:step` in the explore node.
- Provider spans: `GeminiAdapter.generate` and `PaperclipAdapter.generate` wrap in `Provider:generate` with PROVIDER, MODEL_ID, INPUT_TOKENS, OUTPUT_TOKENS.
- `lib/orchestration/tracing/summaries.ts:fetchRecentTraceSummaries` — joins `task_graph_state` + `BudgetLedger` via raw SQL. Returns `TraceSummary[]`. No new infra.
- `app/api/scion/traces/route.ts` — `GET /api/scion/traces?issueId&limit` exposes summaries.
- `scripts/swarm/runner/nodes.ts:build_context` now calls `fetchRecentTraceSummaries({limit: 5})`, stringifies each, passes into `buildDynamicContext`. Fallback to no-summary context on fetch failure.
- Spans carry NO raw prompt text — IDs/counts/names only.
- Test gate: `prisma validate`, `test:types`, `test:swarm:types`, `npm test` (17 suites / 120 tests + 1 skipped), `lint` (0 errors / 70 warnings), `npm run build` with `/api/scion/traces` route — all PASS.

## Frozen this pass
- Canonical span attribute keys live in `SPAN_ATTR`. Adding an ad-hoc attribute key is forbidden — drift gets caught by the pass-18 Critic check.
- Summary source: DB join (Option B). `fetchRecentTraceSummaries` is the single query path. Cloud Trace / Jaeger remain available for deep diagnostics but aren't the context-window source.
- Spans end in `finally`. Every new span must follow this.

## Open carry-forward
- Symbol seeder, 13 extra Tailwind files, scheduler wiring, 70 lint warnings, worker-JSON cull — unchanged.
- Pass 19 (Turn-PPO seam) is deferrable; per decisions.md D2 we proceed with the seam-only (no training).
