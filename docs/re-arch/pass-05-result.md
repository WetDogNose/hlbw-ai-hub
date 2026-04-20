# Pass 05 result

## Changed files
- `scripts/swarm/arbiter.ts`: replaced JSON-file selection logic with a `prisma.$transaction` that runs `SELECT ... FOR UPDATE SKIP LOCKED` against `"Issue"` then `UPDATE` to `in_progress`, mapping the result through `toTask(issue)`. Adds a live-dependency guard (`NOT EXISTS` against `"Issue".status = 'completed'`) so stale dependency ids cannot deadlock the queue. OTEL span wrapper preserved.
- `scripts/swarm/state-manager.ts`: header comment flags the JSON file as a best-effort debug snapshot (Postgres authoritative); Task APIs (`addTask`, `listTasks`, `assignTask`, `completeTask`, `updateTaskStatus`, `getPendingTasks`, `getState`) now read/write Postgres via the `toTask`/`fromTask` adapter; each write calls `refreshSnapshotBestEffort()` which never throws; Worker APIs (`addWorker`, `updateWorkerStatus`, `getWorkerStatus`, `getWorkerResult`, `listWorkers`) remain JSON-backed since no Prisma `Worker` model exists yet; `cleanupRetention` deletes terminal-state `Issue` rows via `prisma.issue.deleteMany` plus the existing worker prune; `withStateLock` and `saveState` retained for worker CRUD and snapshot writes.
- `scripts/swarm/__tests__/arbiter.test.ts`: replaced the `jest.mock('../state-manager')` block with `jest.mock('@/lib/prisma')`; the mock simulates `$transaction` + `$queryRaw` via an in-memory fixture; four original scenarios (no tasks / blocked deps / priority tiebreak / createdAt tiebreak) adjusted to the new `ORDER BY priority DESC` contract.
- `scripts/swarm/__tests__/state.test.ts`: added a mocked `@/lib/prisma` client so `addTask` and `getState` can run without a live DB; both original assertions now pass.

## New files
- `scripts/swarm/__tests__/arbiter.integration.test.ts`: `describe.skip` unless `process.env.DB_TEST === '1'`; seeds one pending `Issue`, spawns two concurrent `getNextAvailableTask()` calls in `Promise.all`, asserts exactly one winner and final status `in_progress`, cleans up the seeded row in `afterEach`.
- `docs/re-arch/checkpoint-05.md`: compaction checkpoint per PLAN.md §2.5.
- `docs/re-arch/pass-05-result.md`: this file.

## New symbols (with location)
- `getNextAvailableTask` at `scripts/swarm/arbiter.ts:25` (rewritten)
- `getOrCreateDefaultThreadId` at `scripts/swarm/state-manager.ts:53`
- `getState` at `scripts/swarm/state-manager.ts:119`
- `refreshSnapshotBestEffort` at `scripts/swarm/state-manager.ts:173`
- `addTask` at `scripts/swarm/state-manager.ts:188` (rewritten)
- `listTasks` at `scripts/swarm/state-manager.ts:233` (rewritten)
- `assignTask` at `scripts/swarm/state-manager.ts:243` (rewritten)
- `completeTask` at `scripts/swarm/state-manager.ts:273` (rewritten)
- `updateTaskStatus` at `scripts/swarm/state-manager.ts:310` (rewritten)
- `getPendingTasks` at `scripts/swarm/state-manager.ts:352` (rewritten)
- `describeOrSkip` at `scripts/swarm/__tests__/arbiter.integration.test.ts:32`

## Deleted symbols
- None. `withStateLock` and `saveState` are still exported and still used by worker CRUD, `cleanupRetention`'s worker prune, and the snapshot writer.

## New deps
- None. The implementation uses the already-installed `@prisma/client@6.4.1` singleton from `lib/prisma.ts`.

## Verifier output
- `npm run test:types`: PASS (exit 0)
- `npm run test:swarm:types`: PASS (exit 0)
- `npm test`: PASS (2 suites, 5 tests — root suite ignores `scripts/swarm/__tests__/` per `jest.config.ts`)
- `npm run lint`: PASS (exit 0; 79 pre-existing warnings, down from 82 at pass 4)
- `npx jest --testPathIgnorePatterns='/node_modules/' scripts/swarm/__tests__/arbiter.test.ts`: PASS (4/4 green)
- `npx jest --testPathIgnorePatterns='/node_modules/' scripts/swarm/__tests__/state.test.ts`: PASS (2/2 green — improvement over pass 2's 1/2)
- `DB_TEST=1 npx jest ... arbiter.integration.test.ts`: RAN but FAILED with `Can't reach database server at 34.142.161.181:5432` — the Cloud SQL proxy was not running in the sub-agent environment. Without `DB_TEST=1` the suite skips cleanly (1 skipped / 0 failed), matching the spec's "must skip cleanly" requirement.

## Integration test status
- Default (no env): skipped cleanly — Test Suites: 1 skipped, Tests: 1 skipped.
- With `DB_TEST=1`: attempts to connect and fails because the proxy is not up in the current environment. This is the documented prerequisite (proxy running on `localhost:5432` pointed at Cloud SQL); the test body itself — seed → `Promise.all` race → assert exactly one winner and `in_progress` final — compiles and runs.

## Open issues / deferred
- No Prisma `Worker` model yet; worker CRUD still writes to `state.json`. Scheduled for the graph-orchestration work (passes 8–10).
- 13 extra Tailwind-using files from pass 3 still awaiting user scope decision.
- 79 lint warnings (unused `e`/`err`/imports) remain; pass 20 cull.
- `provider-contract.test.ts` is a not-a-jest file causing a phantom "Test suite failed to run"; track for pass 20 cleanup.
- The integration test is not yet wired into CI; invoked manually with the proxy.

## Cross-repo impact
- none
