# Checkpoint after pass 5

## Frozen interfaces (name → path)
- `Issue` Prisma model → `prisma/schema.prisma` (unified canonical task row)
- `Task` DTO → `scripts/swarm/types.ts`
- `toTask(issue)` adapter → `scripts/swarm/types.ts`
- `fromTask(task, context)` adapter → `scripts/swarm/types.ts`
- `getNextAvailableTask(): Promise<Task | null>` → `scripts/swarm/arbiter.ts`
- `state-manager` public Task API: `addTask`, `listTasks`, `assignTask`, `completeTask`, `updateTaskStatus`, `getPendingTasks`, `getState` → `scripts/swarm/state-manager.ts`
- `state-manager` public Worker API (JSON-backed, awaiting Worker schema): `addWorker`, `updateWorkerStatus`, `listWorkers`, `getWorkerStatus`, `getWorkerResult` → `scripts/swarm/state-manager.ts`
- Prisma client singleton → `lib/prisma.ts`
- Semantic CSS class convention (from pass 3) → `.scion-*`, `.orchestration-*` in `app/globals.css`
- Jest globals import policy (from pass 2): `import { describe, it, expect, jest, beforeEach } from '@jest/globals'`
- Critic rubric → `docs/re-arch/critic-rubric.md`
- Dispatcher decisions of record → `docs/re-arch/decisions.md`

## Live invariants
- Postgres `Issue` table is the source of truth for all task state.
- Task selection is concurrency-safe across hosts via `SELECT ... FOR UPDATE SKIP LOCKED` inside a `prisma.$transaction`.
- The JSON file `.agents/swarm/state.json` is a best-effort debug snapshot. Tasks in it are authoritative only if the live DB disagrees by mistake; treat it as read-only operator diagnostic data.
- Worker CRUD still lives in the JSON snapshot (no Prisma `Worker` model yet).
- Raw SQL uses `Prisma.sql` / tagged templates — never string concatenation with user input.
- Swarm runtime calls `toTask(issue)` on every read from Postgres and `fromTask(task, context)` on every write.
- The `init` migration at `prisma/migrations/20260420011457_init/migration.sql` was user-applied; pass 5 made no schema changes.
- `prisma/schema.prisma` is unchanged this pass.
- Migrations remain user-gated per decisions.md D5.
- No Tailwind utility classes in SCION or orchestration components (pass 3 invariant).
- Jest tests under `scripts/swarm/__tests__/` are excluded from both the root Jest run and the `scripts/tsconfig.json` type-check; they are run explicitly via `npx jest --testPathIgnorePatterns='/node_modules/' scripts/swarm/__tests__/<name>`.

## Deletions confirmed
- None this pass. The `withStateLock` helper and JSON lockfile machinery are retained for Worker CRUD and the snapshot refresh. No symbols from pass 4 deleted. Dead-code cull is scheduled for pass 20.

## Open issues carrying forward
- 13 extra Tailwind-using files (pass 3) still awaiting user scope decision.
- `provider-contract.test.ts` has been a broken not-a-jest-test since pass 2; fold into a real jest or delete in pass 20.
- No Prisma `Worker`/`Agent` model exists; worker state still in `state.json`. Address when the graph orchestration in passes 8–10 lands, since a persistent Worker row will be needed for `resume-worker.ts`.
- Integration test `arbiter.integration.test.ts` requires Cloud SQL proxy running; documented but not wired into CI.
- 79 swarm-file lint warnings remain (down from 82 in pass 4); scheduled for pass 20 cull.

## Next-5-passes context payload
Passes 6–10 build the orchestration plane on top of this Postgres-backed queue. Pass 6 wires `/api/orchestrator/heartbeat` to call into a new `lib/orchestration/dispatcher.ts` that drains `getNextAvailableTask()` into `scripts/swarm/docker-worker.ts`, so heartbeat → dispatch → worker becomes a closed loop. Pass 7 picks the single episodic memory store (Postgres + pgvector per decisions.md D1) and moves `scripts/swarm/shared-memory.ts` writers to a new `lib/orchestration/memory/MemoryStore.ts` interface; Neo4j becomes a deprecated read adapter. Passes 8–10 introduce a JS-native `StateGraph` runtime under `lib/orchestration/graph/`, convert `scripts/swarm/agent-runner.ts`'s linear Gemini loop into graph nodes with atomic per-transition writes to a new `task_graph_state` table, and rewrite `scripts/swarm/watchdog.ts` so killed workers leave a resumable GraphState row that `resume-worker.ts` can pick up. Pass 10 is the next compaction checkpoint.
