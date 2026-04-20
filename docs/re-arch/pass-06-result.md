# Pass 06 result

## Changed files
- `app/api/orchestrator/heartbeat/route.ts`: rewritten. Stub replaced with auth-gated POST that calls `reclaimStaleWorkers()` then `dispatchReadyIssues(limit)`, returns `{ staleReclaimed, dispatched, elapsedMs, unauthenticated? }`. Wraps every downstream call in try/catch and returns a structured 500 with `detail` on DB error.
- `.env.example`: added `ORCHESTRATOR_SHARED_SECRET=` under a new "Orchestrator (Pass 6 — heartbeat-driven dispatch)" section. Documents insecure dev-mode fallback.

## New files
- `lib/orchestration/dispatcher.ts`: new. Exports `dispatchReadyIssues(limit)`, `reclaimStaleWorkers()`, `spawnWorkerSubprocess(...)`, `DispatchResult`.
- `deploy/scheduler.yaml`: Cloud Scheduler `--flags-file` draft for `hlbw-ai-hub-heartbeat` at `*/2 * * * *` against `asia-southeast1`. Prominent comment block confirms it is NOT deployed by `cloudbuild.yaml` and enablement is deferred to pass 20 per decisions.md D4.
- `app/api/orchestrator/heartbeat/__tests__/route.test.ts`: 6 unit tests covering 401 on missing secret, happy-path summary, dev-mode `unauthenticated` flag, structured 500 paths for both downstream rejections, default limit.
- `scripts/swarm/__tests__/dispatcher.integration.test.ts`: 2 integration tests gated on `DB_TEST=1`. Mocks `spawnWorkerSubprocess` so no Docker/tsx is actually spawned. Asserts two seeded Issues transition to `in_progress` and `reclaimStaleWorkers` reverts an hour-old stuck Issue.

## New symbols (with location)
- `DispatchResult` at `lib/orchestration/dispatcher.ts:15`
- `claimOneReadyIssue` (internal) at `lib/orchestration/dispatcher.ts:33`
- `spawnWorkerSubprocess` at `lib/orchestration/dispatcher.ts:68`
- `dispatchReadyIssues` at `lib/orchestration/dispatcher.ts:107`
- `reclaimStaleWorkers` at `lib/orchestration/dispatcher.ts:155`
- `AUTH_HEADER` at `app/api/orchestrator/heartbeat/route.ts:18`
- `POST` (new signature) at `app/api/orchestrator/heartbeat/route.ts:20`

## Deleted symbols
- None. The pass replaces the body of `POST` in the heartbeat route and adds new code; no files deleted.

## Decision: direct-import vs subprocess
**Subprocess spawn** via `child_process.spawn("npx", ["tsx", scripts/swarm/docker-worker.ts, ...])`. The root `tsconfig.json` excludes `scripts/` from the app type-check graph; importing `scripts/swarm/docker-worker.ts` into a Next.js route would pull `proper-lockfile`, the Docker CLI helpers, and the JSON-state machinery into the server build. Subprocess keeps the Next.js bundle clean and honors the tsconfig split. The atomic SKIP-LOCKED select-and-claim is inlined in `dispatcher.ts` rather than importing `scripts/swarm/arbiter.ts` for the same reason.

## New deps
- None. All APIs used (`child_process.spawn`, `prisma.$transaction`, `prisma.$queryRaw`, `prisma.issue.updateMany`, `next/server` `NextResponse`) are existing runtime symbols already used elsewhere in the repo.

## SDK signatures verified
- `prisma.$transaction` / `prisma.$queryRaw<Issue[]>` / `prisma.issue.updateMany`: all used identically in `scripts/swarm/arbiter.ts` (pass 5, frozen) and `scripts/swarm/state-manager.ts`. `Issue` type comes from `@prisma/client` — same import pattern as `scripts/swarm/types.ts:65`.
- `child_process.spawn` with `{ detached, stdio: "ignore", shell }`: standard Node built-in; `node_modules/@types/node/child_process.d.ts` exports `spawn(command: string, args?: readonly string[], options?: SpawnOptions)`.
- `next/server` `NextResponse.json(body, init)`: identical usage pattern to the existing `app/api/orchestrator/heartbeat/route.ts` pre-pass stub, `app/api/scion/execute/route.ts`, and `app/api/orchestrator/stream/route.ts`. Runtime-verified via Node one-liner.

## Verifier output
- `npm run test:types`: PASS (tsc --noEmit, exit 0).
- `npm run test:swarm:types`: PASS (tsc --noEmit -p scripts/tsconfig.json, exit 0).
- `npm test`: PASS (3 suites, 11 tests — prior 2 suites + 1 new route test with 6 tests; prior suites had 5 tests total).
- `npm run lint`: PASS (0 errors, 78 warnings — 1 fewer than the 79-warning ceiling).
- `npx jest --testPathIgnorePatterns='/node_modules/' scripts/swarm/__tests__/dispatcher.integration.test.ts`: integration test skips cleanly without `DB_TEST=1` (1 skipped suite reported). The `1 failed` in that run is `provider-contract.test.ts`, the pre-existing broken not-a-jest-test documented in checkpoint-05.md §Open issues.
- `npm run build`: PASS. `/api/orchestrator/heartbeat` listed as dynamic (ƒ) route.

## Migration policy
- N/A. `prisma/schema.prisma` unchanged this pass. No new migration drafted.

## Open issues / deferred
- `provider-contract.test.ts` still broken (inherited; slated for pass 20).
- `spawnWorkerSubprocess` is fire-and-forget — detached with `stdio: "ignore"`. Worker output is only visible via the child's own tracing/audit sinks. The graph-state persistence in passes 8–10 will give the dispatcher a real status channel (Prisma `Worker` row or GraphState table).
- Cloud Scheduler wiring in `cloudbuild.yaml` deferred to pass 20 per decisions.md D4. `deploy/scheduler.yaml` exists as the handoff artifact with the exact `gcloud` command embedded as a comment.
- `docker-worker.ts` still has no `require.main === module` CLI dispatch; the subprocess call path is currently aspirational for actual Docker execution. A follow-up within pass 16 (SCION convergence) or pass 10 (resume semantics) is the right moment to make the worker CLI-invocable end-to-end without reshaping the spawn surface.
- Integration test requires Cloud SQL proxy running; the `DB_TEST=1` gate matches the pass-5 convention.

## Cross-repo impact
- None. No edits to `wot-box/`, `genkit/`, `adk-python/`, or `adk-js/`.
