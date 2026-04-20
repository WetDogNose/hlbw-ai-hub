# Checkpoint after pass 10

## Frozen interfaces (name → path)
- `Task`/`Issue` unified model (pass 4) → `prisma/schema.prisma` + `scripts/swarm/types.ts`
- `toTask(issue)` / `fromTask(task, context)` adapters → `scripts/swarm/types.ts`
- `getNextAvailableTask(): Promise<Task | null>` → `scripts/swarm/arbiter.ts`
- `MemoryStore` interface + `PgvectorMemoryStore` (pass 7) → `lib/orchestration/memory/MemoryStore.ts`, `lib/orchestration/memory/pgvector.ts`
- `StateGraph` class: `start / get / transition / resume / interrupt` (pass 8) → `lib/orchestration/graph/StateGraph.ts`
- `defineGraph(definition)` helper → `lib/orchestration/graph/index.ts`
- `Node`, `NodeName`, `NodeOutcome`, `GraphContext`, `GraphDefinition`, `HistoryEntry`, `TaskGraphStateRow` types → `lib/orchestration/graph/types.ts` + `StateGraph.ts`
- Node topology (pass 9): `init_mcp → build_context → propose_plan → execute_step ⇄ record_observation ⇄ evaluate_completion → commit_or_loop` → `scripts/swarm/runner/nodes.ts`
- `RunnerContext` (+ optional `worker: RunnerWorker` from pass 10) → `scripts/swarm/runner/nodes.ts`
- `RunnerWorker` (`provider, modelId, containerId, startedAt`) → `scripts/swarm/runner/nodes.ts`
- `defineAgentGraph()` → `scripts/swarm/runner/nodes.ts`
- `agent-runner.main()` one-shot CLI (reads `AGENT_ISSUE_ID`, skips `start()` on existing row) → `scripts/swarm/agent-runner.ts`
- `spawnDockerWorker(taskId, instruction, branchName, agentCategory)` (now spawns graph driver via `docker exec`) → `scripts/swarm/docker-worker.ts`
- `resumeIssue(issueId, { spawn })` + `ResumeResult` (pass 10) → `scripts/swarm/resume-worker.ts`
- `pickNextResumable(): Promise<string | null>` (pool-manager resume preference) → `scripts/swarm/pool-manager.ts`
- Watchdog interrupt model: `runWatchdog(): Promise<WatchdogInterruption[]>` + `WATCHDOG_TIMEOUT_REASON` → `scripts/swarm/watchdog.ts`
- `appendAudit(entry)` → `scripts/swarm/audit.ts`
- Prisma client singleton → `lib/prisma.ts`
- `SWARM_POLICY.workerTimeoutMinutes` → `scripts/swarm/policy.ts`
- Semantic CSS class convention (pass 3) → `.scion-*`, `.orchestration-*` in `app/globals.css`
- Jest globals import policy (pass 2): `import { describe, it, expect, jest, beforeEach } from '@jest/globals'`
- Critic rubric → `docs/re-arch/critic-rubric.md`
- Dispatcher decisions of record → `docs/re-arch/decisions.md`

## Live invariants
- Postgres is the source of truth for all task state. `Issue` is the task row; `task_graph_state` is the per-task graph state; `memory_episode` is the episodic memory store.
- `_prisma_migrations` has 4 applied: `init` / `memory_episode` / `memory_episode-reconcile` / `task_graph_state`.
- `task_graph_state` rows are authoritative for worker graph progress. `state.json` Worker CRUD is advisory only.
- One-shot CLI dispatch: the swarm has no HTTP A2A layer. Workers are spawned via `docker exec <warmContainer> npx tsx /workspace/scripts/swarm/agent-runner.ts` with `AGENT_ISSUE_ID` in the environment.
- Resume semantics: spawning `agent-runner.ts` when a `task_graph_state` row already exists enters the transition loop directly; `graph.start()` is skipped. `resume-worker.ts` + `pool-manager.pickNextResumable()` drive this path.
- Watchdog never destroys graph state. It only calls `StateGraph.interrupt()` (row flips to `interrupted`, reason preserved) and flips the parent `Issue.status` back to `pending`. Optional best-effort `docker kill` of a matching container. Every intervention audited.
- StateGraph transitions are atomic: each mutation is inside `prisma.$transaction` with a `FOR UPDATE` row lock via `$queryRaw`.
- `prisma/schema.prisma` is unchanged this pass. The 10.6 worker folding uses the existing `context Json` column on `task_graph_state`.
- Migrations remain user-gated per decisions.md D5.
- Raw SQL uses `Prisma.sql` tagged templates.
- Jest tests under `scripts/swarm/__tests__/` and `scripts/swarm/runner/__tests__/` are excluded from root `npm test` and from `scripts/tsconfig.json` type-check; run explicitly via `npx jest --config jest.config.ts --roots <rootDir>/scripts/swarm/__tests__/ --testRegex '<name>\.test\.ts$'`.

## Deletions confirmed
- `scripts/swarm/docker_exec_proxy.js` — deleted. Grep across `c:/Users/Jason/repos/{hlbw-ai-hub,wot-box,genkit,adk-python,adk-js}` for the identifier `docker_exec_proxy`, scoped to `*.{ts,tsx,js,mjs,cjs,py,ps1,sh,cmd,bat,yaml,yml,json,md}` plus `Dockerfile*` and `.agents/**`, returned only prose hits in `docs/re-arch/*.md`, `docs/re-arch/INVENTORY.md:38`/`:311`, and `CLAUDE.md` narrative. No live code references. The sole code caller (the HTTP A2A path in `docker-worker.ts:123`) was removed in 10.1 before the file was deleted.

## Open issues carrying forward
- 13 extra Tailwind-using files (pass 3) still awaiting user scope decision.
- `scripts/swarm/__tests__/provider-contract.test.ts` still an empty-file jest suite — scheduled for pass 20 cull.
- 59 swarm lint warnings (down from 68 pass-9, 79 pass-5) — scheduled for pass 20 cull.
- Scheduler/Cloud Scheduler wiring for watchdog + `pool-manager resume-next` cadence deferred to pass 20 when cloudbuild.yaml is allowed to change.
- `resume-worker.integration.test.ts` requires `DB_TEST=1` and a Cloud SQL proxy running — not wired into CI.
- Dead-code cull (including the remaining `withStateLock` machinery once Worker rows move fully into `task_graph_state.context`) deferred to pass 20.

## Next-5-passes context payload
Passes 11–15 decompose the runner graph and build the dynamic context window. Pass 11 splits `propose_plan` / `evaluate_completion` into `scripts/swarm/roles/actor.ts`, `roles/critic.ts`, `roles/orchestrator.ts`, enforcing a hard Critic/Actor prompt boundary (Critic receives the proposal + rubric, never Actor reasoning). Pass 12 adds a per-category rubric registry under `lib/orchestration/rubrics/` (`1_qa`, `2_source_control`, `3_cloud`, `4_db`, `5_bizops`, `default`) and an early-stopping policy (confidence ≥0.85, ≤3 critique cycles; third failure marks the task `needs_human`). Pass 13 encodes the context-isolation boundary at the type level via `CriticInput` / `ActorInput` + a `lib/orchestration/prompts/render.ts` that asserts no cross-contamination. Pass 14 adds a read-only exploration budget (`explorationBudget: 8` Grep/Read/MCP `get_*` calls) through a new `lib/orchestration/explorer.ts` and an `explore` node placed before `propose_plan`. Pass 15 is the next compaction checkpoint — it rewrites `build_context` as the dynamic context-window builder: task embeddings → top-k memory episodes → top-k code symbols → OTEL trace summaries → rubric + tool catalogue, packed by relevance density.
