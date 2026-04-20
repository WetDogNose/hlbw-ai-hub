# Pass 18 result

## Changed files
- `lib/orchestration/graph/StateGraph.ts`: wrap `transition()` body in an `Orchestrator:tracer.startActiveSpan("Graph:transition", ...)` call that renames the span to `Graph:<node>` via `span.updateName`, sets `SPAN_ATTR.TASK_ID / NODE / NODE_OUTCOME / AGENT_CATEGORY`, records exceptions, and ends the span in both success and error paths via `try/finally`.
- `scripts/swarm/roles/actor.ts`: `propose()` now accepts `opts.cycle` and runs its provider call inside an `Actor:propose` span tagged `ROLE=actor`, `TASK_ID`, `MODEL_ID`, `CYCLE`.
- `scripts/swarm/roles/critic.ts`: `evaluate()` now accepts `opts.cycle` and runs its provider call inside a `Critic:evaluate` span tagged `ROLE=critic`, `TASK_ID`, `MODEL_ID`, `RUBRIC_NAME`, `CYCLE`; after the verdict parses it sets `VERDICT` and `CONFIDENCE` on the same span.
- `scripts/swarm/roles/orchestrator.ts`: `runSingleCycle` accepts and forwards `opts.cycle`; `runActorCriticLoop` wraps its for-loop in an `Orchestrator:loop` span tagged `ROLE=orchestrator`, `TASK_ID`, `MODEL_ID`, `RUBRIC_NAME`; updates `CYCLE` each iteration and tags the final `VERDICT`/`CONFIDENCE`.
- `scripts/swarm/runner/nodes.ts`: `explore` node span renamed to `Explorer:step` and annotated with the standardized schema (`ROLE=explorer`, `TASK_ID`, `AGENT_CATEGORY`, `NODE`, `MODEL_ID`); `build_context` node now calls `fetchRecentTraceSummaries({ limit: 5 })` and passes the stringified results into `BuildContextInput.recentTraceSummaries` (falls through to `undefined` on error).
- `scripts/swarm/providers.ts`: both adapters now share the span name `Provider:generate`; each tags `PROVIDER`, `MODEL_ID`, optional `TASK_ID`, and — on success — `INPUT_TOKENS` / `OUTPUT_TOKENS` using `SPAN_ATTR` keys.
- `lib/orchestration/graph/__tests__/StateGraph.test.ts`: added an in-memory `getOrchestratorTracer` mock with a `capturedSpans` array; extended with three new tests (happy-path attribute set; error path records exception; `$transaction` throw path still ends the span).

## New symbols (with location)
- `SPAN_ATTR` at `lib/orchestration/tracing/attrs.ts:15`
- `SpanAttrKey` at `lib/orchestration/tracing/attrs.ts:31`
- `SPAN_ROLE` at `lib/orchestration/tracing/attrs.ts:35`
- `SpanRole` at `lib/orchestration/tracing/attrs.ts:43`
- `getOrchestratorTracer` at `lib/orchestration/tracing/tracer.ts:18`
- `TraceSummary` at `lib/orchestration/tracing/summaries.ts:22`
- `FetchRecentTraceSummariesOptions` at `lib/orchestration/tracing/summaries.ts:33`
- `fetchRecentTraceSummaries` at `lib/orchestration/tracing/summaries.ts:65`
- `stringifyTraceSummary` at `lib/orchestration/tracing/summaries.ts:134`
- `ScionTracesResponse` at `app/api/scion/traces/route.ts:18`
- `GET` at `app/api/scion/traces/route.ts:25` (Next.js route handler)

## Deleted symbols
- none — verified by grep for deletions (no `git rm`, no removed exports; span-name strings were renamed in place, not deleted).

## New deps
- none — reuses existing `@opentelemetry/api` (v1.9.0 per `node_modules/@opentelemetry/api/package.json`). The SDK already registers the global tracer via `startTracing()` in `scripts/swarm/tracing.ts`; `getOrchestratorTracer` is a thin wrapper over `trace.getTracer`.

## SDK verification
- `@opentelemetry/api` `Tracer.startActiveSpan(name, fn)` signature verified at `node_modules/@opentelemetry/api/build/src/trace/tracer.d.ts:69`. Mock `startActiveSpan` in `StateGraph.test.ts` matches this overload (`(name, fn)`).
- `Span.setAttribute`, `setAttributes`, `updateName`, `recordException`, `end` verified at `node_modules/@opentelemetry/api/build/src/trace/span.d.ts:36,44,91,118,104`.
- `Prisma.sql` / `Prisma.join` / `Prisma.empty` verified through the generated client typings used in existing `lib/orchestration/graph/StateGraph.ts:lockRowForUpdate`.

## Summary-query strategy
- **Option B** (Postgres join) — chosen per PLAN §18.6 because no new creds / no new infra are required. `fetchRecentTraceSummaries` runs two `prisma.$queryRaw` calls: one against `task_graph_state` (with `jsonb_array_length(history)` for `nodeCount` and `updatedAt - createdAt` for `durationMs`) and one against `"BudgetLedger"` grouped by `issueId` for token totals. `BudgetLedger` stores a single `tokensUsed` per row — the summary reports that under `totalTokens.output` and leaves `input: 0` (documented in the module header); callers serialize the whole object with `stringifyTraceSummary` for context-builder consumption.

## Observability attribute hygiene
- All attributes are IDs, names, counts, or fixed-vocabulary verdicts (`"PASS" | "REWORK"`, `"goto" | "interrupt" | "complete" | "error"`, role strings, cycle integers, confidence floats). No raw prompt text, no task instruction bodies, no PII. Tool names are exposed only on exploration `exploration.tool` keys (user-supplied tool names are not secrets).
- Spans end in both success and error paths — every role + graph + provider span uses `try { ... } catch { span.recordException; throw } finally { span.end() }`.

## Verifier output
- `npx prisma validate`: PASS (schema valid).
- `npm run test:types`: PASS (exit 0, no TypeScript errors).
- `npm run test:swarm:types`: PASS (exit 0, no TypeScript errors).
- `npm test`: PASS — 17 suites passed / 1 skipped of 18 total; 120 tests passed + 1 skipped.
  - New suites included: `lib/orchestration/tracing/__tests__/summaries.test.ts` (5 tests), `app/api/scion/traces/__tests__/route.test.ts` (5 tests). StateGraph suite extended from 21 → 24 tests.
- `npm run lint`: PASS — 0 errors, 70 warnings (≤79 ceiling per checkpoint-15).
- `npm run build`: PASS — Next.js compiled successfully; `/api/scion/traces` route listed in the routes table.

## Open issues / deferred
- BudgetLedger schema has no per-row model id → `TraceSummary.modelIds` ships as `[]`. Recording the model in the ledger would require a schema change; deferred to pass 20 cull pass or a later observability refinement.
- BudgetLedger does not split `inputTokens` vs `outputTokens`; `TraceSummary.totalTokens` always reports the sum under `.output`. Deferred; same rationale.
- SCION UI "Recent runs" sidebar wiring is NOT part of pass 18 per spec §18.8.
- Symbol seeder / residual Tailwind / scheduler wiring / worker-JSON cull — carry-forward from pass 17.

## Cross-repo impact
- none.
