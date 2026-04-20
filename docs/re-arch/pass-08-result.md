**ESCALATE required before pass 9**

# Pass 08 result

Phase C, pass 1: in-house StateGraph runtime with a Postgres-backed
`task_graph_state` row per Issue. No external LangGraph dep — pass 1
inventory surfaced no concrete need for Python/LangGraph interop, so the
runtime is TypeScript-native and binds to the existing
`scripts/swarm/docker-worker.ts` surface in later passes (9–13). Migration
is drafted only; user must approve per D5.

## Changed files
- `prisma/schema.prisma`: added `TaskGraphState` model, `GraphStateStatus` enum, and reverse relation `graphState TaskGraphState?` on `Issue`.

## New files
- `prisma/migrations/20260420034813_task_graph_state/migration.sql`: drafted via `prisma migrate dev --create-only`. DO NOT apply — user-gated per D5.
- `lib/orchestration/graph/types.ts`: `NodeName`, `GraphContext`, `HistoryEntry`, `NodeOutcome`, `Node`, `GraphDefinition`.
- `lib/orchestration/graph/StateGraph.ts`: `StateGraph` class, `TaskGraphStateRow` type (inferred from `Prisma.TaskGraphStateGetPayload`).
- `lib/orchestration/graph/index.ts`: barrel export + `defineGraph(definition)` helper.
- `lib/orchestration/graph/__tests__/StateGraph.test.ts`: 21 unit tests against an in-memory Prisma mock.
- `lib/orchestration/graph/__tests__/StateGraph.integration.test.ts`: DB-backed smoke test, gated on `DB_TEST=1`.

## New symbols (with location)
- `TaskGraphState` model at `prisma/schema.prisma:283`
- `GraphStateStatus` enum at `prisma/schema.prisma:301`
- `graphState` relation field on `Issue` at `prisma/schema.prisma:215`
- `NodeName` at `lib/orchestration/graph/types.ts:12`
- `GraphContext` at `lib/orchestration/graph/types.ts:16`
- `HistoryEntry` at `lib/orchestration/graph/types.ts:22`
- `NodeOutcome` at `lib/orchestration/graph/types.ts:31`
- `Node` at `lib/orchestration/graph/types.ts:38`
- `GraphDefinition` at `lib/orchestration/graph/types.ts:45`
- `TaskGraphStateRow` at `lib/orchestration/graph/StateGraph.ts:28`
- `StateGraph` class at `lib/orchestration/graph/StateGraph.ts:75`
- `StateGraph.start` at `lib/orchestration/graph/StateGraph.ts:89`
- `StateGraph.get` at `lib/orchestration/graph/StateGraph.ts:119`
- `StateGraph.transition` at `lib/orchestration/graph/StateGraph.ts:134`
- `StateGraph.resume` at `lib/orchestration/graph/StateGraph.ts:247`
- `StateGraph.interrupt` at `lib/orchestration/graph/StateGraph.ts:277`
- `defineGraph` at `lib/orchestration/graph/index.ts:29`

## Deleted symbols
- None.

## New deps
- None. The runtime uses only `@prisma/client` (already at 6.4.1) and the existing `@/lib/prisma` singleton.

## SDK signature verification
- `Prisma.TaskGraphStateGetPayload` — verified at `node_modules/.prisma/client/index.d.ts:21926`.
- `Prisma.TransactionClient` — pre-existing usage elsewhere; re-checked via generated client.
- `prisma.taskGraphState` delegate — verified at `node_modules/.prisma/client/index.d.ts:430`.
- `GraphStateStatus` enum values — verified at `node_modules/.prisma/client/index.d.ts:111` and `:21814`.
- `prisma.$queryRaw(Prisma.sql`...`)` tagged-template form — verified at `node_modules/@prisma/client/runtime/library.d.ts:1608` and `Sql` class at `node_modules/@prisma/client/runtime/library.d.ts:3217`.

## Verifier output
- `npx prisma validate`: PASS (exit 0).
- `npx prisma generate`: PASS (exit 0, Prisma Client v6.4.1 regenerated).
- `npx prisma migrate dev --create-only --name task_graph_state`: PASS (exit 0). Generated `prisma/migrations/20260420034813_task_graph_state/migration.sql`. NOT applied.
- `npm run test:types`: PASS (exit 0).
- `npm run test:swarm:types`: PASS (exit 0).
- `npm test`: PASS (exit 0). 4 suites passed, 1 suite skipped (`StateGraph.integration.test.ts`, gated on `DB_TEST=1`). 32 tests passed, 1 skipped. Counts add the new `StateGraph.test.ts` (21 tests) on top of pass 7's baseline (11 tests).
- `npm run lint`: PASS (exit 0). 0 errors, 78 warnings (≤79 cap; unchanged from pass 7 — no new warnings introduced).
- `StateGraph.test.ts` coverage for `StateGraph.ts`: 100% lines, 100% functions, 97.7% statements, 92.5% branches. `npx jest --coverage --collectCoverageFrom='lib/orchestration/graph/StateGraph.ts' lib/orchestration/graph/__tests__/StateGraph.test.ts`.
- `npm run build`: NOT RUN (out of scope; D5/ESCALATE expected).
- `prisma migrate dev` (apply): NOT RUN (D5 user-gated).

## Atomicity contract (enforced in code + tests)
- Every mutation in `StateGraph` (`start`, `transition`, `resume`, `interrupt`) is wrapped in `prisma.$transaction`.
- `transition`, `resume`, `interrupt` additionally acquire a `FOR UPDATE` row lock via `$queryRaw(Prisma.sql\`SELECT ... FOR UPDATE\`)` before mutating.
- `transition` refuses to run when `status !== 'running'` (unit-tested against `interrupted` and `paused`).
- The `atomic: two concurrent calls observe serialized state` test in `StateGraph.test.ts:447` confirms the serialization semantics via an in-memory mock that queues transactions.

## Open issues / deferred
- Migration application is user-gated (D5). Pass 9 is blocked until the user runs `npx prisma migrate dev --name task_graph_state` against the DB hosting the `Issue` table.
- `scripts/swarm/agent-runner.ts` is untouched in this pass; pass 9 converts its linear loop into graph nodes backed by this runtime.
- Integration test is gated on `DB_TEST=1`; CI wiring for the Cloud SQL proxy is still carried forward from pass 5.
- 78 swarm-file lint warnings carried over; pass 20 cull scheduled.

## Cross-repo impact
- None. No edits to `wot-box`, `genkit`, `adk-python`, `adk-js`. No `cloudbuild.yaml` edits. No new files at repo root.

## USER ACTION REQUIRED — dispatcher paused
The Cloud SQL proxy is still running from pass 7 (127.0.0.1:5433). To unblock pass 9:

```
cd c:/Users/Jason/repos/hlbw-ai-hub
npx prisma migrate dev --name task_graph_state
```

Reply with the migrate output (success or error). Pass 9 migrates `scripts/swarm/agent-runner.ts` onto the StateGraph primitive delivered here.
