# Pass 16 verified

**Cycles**: 2 (1 REWORK — error-path token usage). **Verdict**: PASS.

## What's now true
- SCION UI reads from unified state. New API surface:
  - `GET /api/scion/state` → issues + graphState + ledger total + worker counts.
  - `POST /api/scion/execute` → creates Issue(status=`pending`); does NOT synchronously dispatch (heartbeat route handles that). Keeps pre-existing budget ceiling via new helper `lib/orchestration/budget.ts:assertBudgetAvailable`.
  - `GET /api/scion/issue/[id]` → one Issue detail + graph state + recent history.
  - `GET /api/orchestrator/stream?issueId=...` → real SSE polling `TaskGraphState.history`, keep-alive `:keep-alive\n\n` every 15s, 120s max connection.
- 5 orchestration components rewired to use SWR hitting `/api/scion/state` — still vanilla CSS; new semantic classes added to `globals.css`. Zero Tailwind leaks.
- New `ExecuteDialog.tsx` for the Execute button (agentName + instruction + agentCategory form).
- `lib/orchestration/budget.ts` — `assertBudgetAvailable`, `recordTokenUsage`. Ledger writes a row with `error:true` flag for error-path charges.
- `scripts/swarm/providers.ts` `GeminiAdapter.generate` records provider usage in a `finally` block, wrapping the record call in an inner try/catch so ledger failures don't mask the original error.
- Test gate: 15 suites / 107 tests + 1 skipped (rework added 2 error-path tests), 0 errors / 68 warnings, build green.

## Frozen this pass
- SCION ↔ swarm contract: Issue creation is async from SCION's perspective; the heartbeat is the dispatcher.
- SSE contract: DB-as-bus, 1s poll, `?since=<ISO>` cursor, 120s cap, client reconnects after.
- BudgetLedger contract: every provider call produces exactly one ledger row (success OR error path). The ledger is the authoritative spend source.

## Open carry-forward
- Symbol seeder script (pass 15), 13 extra Tailwind files (outside SCION scope), scheduler wiring (pass 20), worker-JSON cull (pass 20), 68 lint warnings — unchanged.
