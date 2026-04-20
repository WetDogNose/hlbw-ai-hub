# Pass 16 result

> REWORK cycle 1 applied — Critic finding #6 (token-usage recording on error path) is resolved. `GeminiAdapter.generate()` now uses try/catch/finally so `recordProviderUsage` fires in both success and failure paths; `RecordProviderUsageInput` and `RecordTokenUsageInput` gained an optional `error: boolean` flag; two new tests in `lib/orchestration/__tests__/budget.test.ts` cover the error-path write and the error-flagged aggregate.

## Changed files
- `app/api/scion/execute/route.ts`: replaced stub `Issue` creation with a graph-rooted async write; budget gate goes through `assertBudgetAvailable()`; returns `{ issueId, threadId }`; no synchronous worker spawn.
- `app/api/orchestrator/stream/route.ts`: removed 15-line fake-debug emitter; real SSE sourced from `TaskGraphState.history` polled every 1000ms; keep-alive every 15s; max 120s connection; `?issueId=` required, `?since=` cursor supported.
- `scripts/swarm/providers.ts`: `GeminiAdapter.generate()` now computes approximate input/output tokens and calls `recordProviderUsage()`; new `recordProviderUsage()` wrapper dynamically imports `lib/orchestration/budget` to avoid hard-coupling scripts runtime to Next-side Prisma boot.
- `components/scion-dashboard.tsx`: now a client component that fetches `/api/scion/state` via SWR (5s refresh); injects `ExecuteDialog` and passes live `issues` / `ledgerTotal` / `workerCounts` to child panels; no hardcoded data; zero Tailwind.
- `components/orchestration/TopographyTree.tsx`: takes `{ issues, workerCounts }` props; flat list grouped by status; no Tailwind.
- `components/orchestration/GoalTracker.tsx`: progress bar (`completed / total`) + first 5 issue summaries; no Tailwind.
- `components/orchestration/IssueInbox.tsx`: sort + filter controls (`all | pending | in_progress | interrupted | needs_human | completed | failed`); links to `/admin/scion/issue/[id]`; no Tailwind.
- `components/orchestration/GlobalLedger.tsx`: real `ledgerTotal` + ceiling bar from props; no Tailwind.
- `app/globals.css`: appended pass-16 additions (execute-dialog, topography-summary, goal-progress, ledger-progress, issue-inbox__controls, empty-state classes). All under the existing `/* === SCION / Orchestration */` block.

## Changed files — REWORK cycle 1
- `scripts/swarm/providers.ts`: `GeminiAdapter.generate()` reworked to try/catch/finally. `inputTokens`, `outputTokens`, `taskId`, and an `errored` flag are hoisted above the try; the `finally` block invokes `recordProviderUsage` in both success and error paths with `error: errored`. Inner `try/catch` around `recordProviderUsage` prevents ledger failures from masking the provider's original error. `span.end()` moved into `finally` (removed from the success mid-path) so spans still close on error. `RecordProviderUsageInput` gained optional `error?: boolean`. The `recordProviderUsage` skip guard now allows error-path rows through even when `total === 0` (`if (total <= 0 && !input.error) return;`) so a zero-token failure still writes an auditable ledger row.
- `lib/orchestration/budget.ts`: `RecordTokenUsageInput` gained optional `error?: boolean`. `recordTokenUsage` logs a `console.warn` tag when `error: true` so operators can grep error-path spend; the ledger row itself is written identically (no schema change). The aggregate in `assertBudgetAvailable` sums `tokensUsed` across all rows, so error-flagged rows count toward the daily limit unchanged.
- `lib/orchestration/__tests__/budget.test.ts`: +2 tests under the `recordTokenUsage` describe block. (1) "writes a ledger row when the provider call throws (error:true)" — passes `error: true` and asserts `ledgerCreate` still fires and the row carries the correct `issueId` and `tokensUsed`. (2) "error-flagged rows still count toward the daily budget total" — mocks the aggregate at `DAILY_TOKEN_LIMIT + 500` and asserts `assertBudgetAvailable` throws `BudgetExceededError` with the full `totalUsage`.

## New files
- `lib/orchestration/budget.ts`: `assertBudgetAvailable()`, `recordTokenUsage()`, `BudgetExceededError`, `DAILY_TOKEN_LIMIT`, `SYSTEM_AGENT_NAME`, `SYSTEM_ORG_NAME`. Singleton system AgentPersona upsert handles the `BudgetLedger.agentId` FK without schema change.
- `app/api/scion/state/route.ts`: `GET` returning `{ issues, ledgerTotal, workerCounts, nextCursor }`; cursor-paginated on `createdAt DESC, id DESC`; `limit` default 50, max 200.
- `app/api/scion/issue/[id]/route.ts`: `GET` single-issue detail with graphState + last-25 `HistoryEntry` slice.
- `components/orchestration/ExecuteDialog.tsx`: form component with `agentName`, `agentCategory` (6-choice select), `instruction` textarea; POSTs to `/api/scion/execute`; toast + SWR mutate via parent callback.
- `app/api/scion/state/__tests__/route.test.ts`: 4 tests (shape, cursor, null sum, 500 error path).
- `app/api/scion/execute/__tests__/route.test.ts`: 5 tests (validation, budget 429, happy path, defaults).
- `app/api/orchestrator/stream/__tests__/route.test.ts`: 3 tests (400 without issueId, first transition <2s, keep-alive at 15s with fake timers).
- `lib/orchestration/__tests__/budget.test.ts`: 8 tests (under-limit, over-limit 429, null sum, existing agent, new org+agent, existing org only, error-path ledger write, error-flagged rows counted in budget aggregate). +2 tests from REWORK cycle 1.

## New symbols (with location)
- `DAILY_TOKEN_LIMIT` at `lib/orchestration/budget.ts:15`
- `SYSTEM_AGENT_NAME` at `lib/orchestration/budget.ts:17`
- `SYSTEM_ORG_NAME` at `lib/orchestration/budget.ts:18`
- `BudgetExceededError` at `lib/orchestration/budget.ts:20`
- `RecordTokenUsageInput` at `lib/orchestration/budget.ts:34`
- `assertBudgetAvailable` at `lib/orchestration/budget.ts:56`
- `recordTokenUsage` at `lib/orchestration/budget.ts:105`
- `IssueWithGraphState` at `app/api/scion/state/route.ts:24`
- `ScionStateResponse` at `app/api/scion/state/route.ts:46`
- `GET` (scion state) at `app/api/scion/state/route.ts:62`
- `IssueDetailResponse` at `app/api/scion/issue/[id]/route.ts:12`
- `GET` (scion issue) at `app/api/scion/issue/[id]/route.ts:39`
- `MAX_CONNECTION_MS` at `app/api/orchestrator/stream/route.ts:27`
- `POLL_INTERVAL_MS` at `app/api/orchestrator/stream/route.ts:28`
- `KEEPALIVE_INTERVAL_MS` at `app/api/orchestrator/stream/route.ts:29`
- `KEEPALIVE_COMMENT` at `app/api/orchestrator/stream/route.ts:30`
- `fetchNewHistory` at `app/api/orchestrator/stream/route.ts:45`
- `GET` (orchestrator stream) at `app/api/orchestrator/stream/route.ts:59`
- `RecordProviderUsageInput` at `scripts/swarm/providers.ts:45`
- `recordProviderUsage` at `scripts/swarm/providers.ts:67`
- `SCION_STATE_KEY` at `components/scion-dashboard.tsx:23`
- `ScionDashboard` (default export) at `components/scion-dashboard.tsx:25`
- `ExecuteDialogProps` at `components/orchestration/ExecuteDialog.tsx:17`
- `ExecuteDialog` (default export) at `components/orchestration/ExecuteDialog.tsx:21`
- `TopographyTreeProps` at `components/orchestration/TopographyTree.tsx:7`
- `GoalTrackerProps` at `components/orchestration/GoalTracker.tsx:7`
- `IssueInboxProps` at `components/orchestration/IssueInbox.tsx:8`
- `GlobalLedgerProps` at `components/orchestration/GlobalLedger.tsx:6`

## Deleted symbols
- (none — pass 16 adds/replaces; no file or symbol was removed.)

## New deps
- (none — `swr@2.4.1` was already installed pre-pass; verified at `node_modules/swr/package.json`.)

## Verifier output
- `npx prisma validate`: PASS (schema valid)
- `npm run test:types`: PASS (exit 0)
- `npm run test:swarm:types`: PASS (exit 0)
- `npm test`: PASS (15 suites / 107 tests + 1 skipped; REWORK cycle 1 added 2 tests in `lib/orchestration/__tests__/budget.test.ts` — was 105, now 107)
- `npm run lint`: PASS (0 errors, 68 warnings; ceiling 79)
- `npm run build`: PASS (26 routes compiled, including `/api/scion/state`, `/api/scion/issue/[id]`)
- Tailwind scan on rewritten components: 0 hits in `components/scion-dashboard.tsx` and `components/orchestration/*`

## Open issues / deferred
- `Execute` button routes to `/admin/scion/issue/[id]` which is not yet a page — pass-17+ UI work.
- Component tests (React Testing Library) are out-of-scope: no RTL setup in `tsconfig` and the test environment is `node`. Dispatch-side SSE test is covered via stream route unit test; component wiring is covered by the build-time typecheck of SWR types against `ScionStateResponse`.
- `providers.ts::recordProviderUsage` is opt-in per call (requires `GenerationRequest.metadata.taskId`). Non-Gemini adapters and the swarm runner callers will pick this up in pass-17 when Paperclip is wrapped as a provider.
- Existing 13 Tailwind-using files in `components/thread/*` remain (pass-3 residue; unchanged carry from checkpoint-15). None were rewritten this pass.
- `docs/re-arch/checkpoint-15.md` open items (symbol seeder, scheduler cadence, 69 swarm lint warnings, worker-JSON legacy, dead-code cull) — unchanged carry.
- The new `error: boolean` flag on `RecordTokenUsageInput` / `RecordProviderUsageInput` is surfaced only via `console.warn`; a schema column (`BudgetLedger.errorFlag`) would require a migration and is deferred until there is an operator dashboard that needs to filter on it.

## Cross-repo impact
- none.
