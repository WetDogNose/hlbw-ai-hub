# Pass 06 verified

**Cycles**: 1. **Verdict**: PASS.

## What's now true
- `lib/orchestration/dispatcher.ts` exports `dispatchReadyIssues(limit)` and `reclaimStaleWorkers()`. Uses Prisma for stale reclaim; subprocess-spawns `npx tsx scripts/swarm/docker-worker.ts` for worker starts (avoids crossing the app/scripts tsconfig boundary).
- `app/api/orchestrator/heartbeat/route.ts` rewritten: calls `reclaimStaleWorkers` then `dispatchReadyIssues`, returns `{ staleReclaimed, dispatched, elapsedMs }`. Secret-header auth via `ORCHESTRATOR_SHARED_SECRET`, with dev-mode fallback that flags unauthenticated requests.
- `deploy/scheduler.yaml` drafted (NOT wired into `cloudbuild.yaml`) — `*/2 * * * *` POST to the heartbeat route with the secret header. Wiring decision deferred to pass 20.
- `.env.example` adds `ORCHESTRATOR_SHARED_SECRET=`.
- New tests: `app/api/orchestrator/heartbeat/__tests__/route.test.ts` (401 / 200 / 500 paths, dispatcher mocked), `scripts/swarm/__tests__/dispatcher.integration.test.ts` (DB_TEST=1 gated; `spawnDockerWorker` mocked).
- Test gate: `test:types`, `test:swarm:types`, `npm test` (3 suites / 11 tests), `lint` (78 warnings / 0 errors), `npm run build` — all PASS.

## Frozen this pass
- API-side orchestration lives under `lib/orchestration/`. `scripts/` remains the runtime worker side and is never imported from `app/`.
- Heartbeat contract: `POST /api/orchestrator/heartbeat` → `{ staleReclaimed, dispatched: DispatchResult[], elapsedMs }`.
- Cloud Scheduler config is filesystem-tracked but never auto-applied.

## Open carry-forward
- Scheduler wiring (cloudbuild.yaml) deferred to pass 20.
- Worker persistence still JSON-backed (pass 5 carry-forward).
- 13 extra Tailwind files, lint-warning cleanup — unchanged.
