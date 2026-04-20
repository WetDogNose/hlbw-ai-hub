# Checkpoint after pass 15

## Frozen interfaces (name → path)
- `MemoryStore` / `MemoryEpisode` / `MemoryEpisodeSimilarity` / `WriteEpisodeInput` / `SimilarityQueryOptions` → `lib/orchestration/memory/MemoryStore.ts`
- `PgvectorMemoryStore` + `getPgvectorMemoryStore()` → `lib/orchestration/memory/PgvectorMemoryStore.ts`
- `CodeIndex` / `CodeSymbol` / `CodeSymbolKind` / `CodeSymbolSimilarity` / `CodeSymbolQueryOptions` → `lib/orchestration/code-index.ts`
- `PgvectorCodeIndex` → `lib/orchestration/code-index/PgvectorCodeIndex.ts` (reuses `memory_episode` with `kind: "entity"`; no schema change)
- `EmbeddingProvider` → `lib/orchestration/embeddings/EmbeddingProvider.ts`
- `VertexEmbeddingProvider` / `StubEmbeddingProvider` / `createEmbeddingProvider` / `getEmbeddingProvider` / `resetEmbeddingProvider` → `lib/orchestration/embeddings/*.ts`, `lib/orchestration/embeddings/index.ts`
- `buildDynamicContext` + `BuildContextInput` / `BuildContextOutput` / `BuildContextChunk` / `BuildContextDeps` / `approxTokens` → `lib/orchestration/context-builder.ts`
- `getRunnerDeps` / `setRunnerDeps` / `RunnerDeps` → `scripts/swarm/runner/deps.ts`
- `StateGraph` class: `start / get / transition / resume / interrupt` → `lib/orchestration/graph/StateGraph.ts`
- `defineGraph` / `Node` / `NodeName` / `NodeOutcome` / `GraphContext` / `GraphDefinition` / `HistoryEntry` / `TaskGraphStateRow` → `lib/orchestration/graph/*`
- `Rubric` / `RubricCheck` / `loadRubric` + per-category rubrics (`DEFAULT_RUBRIC`, `QA_RUBRIC`, `SOURCE_CONTROL_RUBRIC`, `CLOUD_RUBRIC`, `DB_RUBRIC`, `BIZOPS_RUBRIC`) → `lib/orchestration/rubrics/*`
- `renderActorPrompt` / `renderCriticPrompt` → `lib/orchestration/prompts/render.ts`
- `runActorCriticLoop` + `ActorInput` / `ActorProposal` / `CriticInput` → `scripts/swarm/roles/orchestrator.ts`, `scripts/swarm/roles/actor.ts`, `scripts/swarm/roles/critic.ts`
- `filterReadOnlyTools` / `proposeExplorationStep` / `ExplorationContext` / `ExplorationStep` / `ExplorationOutcome` → `lib/orchestration/explorer.ts`
- `RunnerContext` (+ optional `worker` + `explorationBudget`/`explorationHistory`/`explorationNotes` + `contextBuildMeta`) → `scripts/swarm/runner/nodes.ts`
- Graph topology: `init_mcp → build_context → explore → propose_plan → execute_step ⇄ record_observation ⇄ evaluate_completion → commit_or_loop` → `scripts/swarm/runner/nodes.ts`
- `defineAgentGraph()` → `scripts/swarm/runner/nodes.ts`
- `agent-runner.main()` one-shot CLI + resume semantics (pass 10) → `scripts/swarm/agent-runner.ts`, `scripts/swarm/resume-worker.ts`, `scripts/swarm/pool-manager.ts`
- Watchdog interrupt model → `scripts/swarm/watchdog.ts`
- Prisma client singleton → `lib/prisma.ts`
- Semantic CSS class convention → `app/globals.css`
- Jest globals import policy → `import { ... } from '@jest/globals'`
- Critic rubric → `docs/re-arch/critic-rubric.md`
- Dispatcher decisions of record → `docs/re-arch/decisions.md`

## Live invariants
- The dynamic context-window builder (`buildDynamicContext`) is the ONLY path the `build_context` node takes in production. On embedding-provider or storage failure the node logs a warning and falls back to `buildStaticContext()` (private helper; the pass-9 tool-dump body), but this path is strictly a degradation.
- Context ordering is fixed: rubric → top-k memory (`1 / (1 + distance)` weight) → top-k symbols → tool catalogue (compacts under budget pressure) → optional trace summaries → task instruction LAST. Mandatory chunks (rubric, tool catalogue, instruction) survive truncation.
- Token budget uses the `Math.ceil(chars / 4)` approximation; 20,000 chars/4 default. This is a signal-density ceiling, not a tokenizer-true promise.
- Symbol seeding is TBD. The `PgvectorCodeIndex` starts empty; `queryBySimilarity` returns `[]`; the builder handles it without error.
- Symbol storage reuses `memory_episode` with `kind: "entity"` — no schema change this pass.
- Postgres is the source of truth for all task, memory, code-symbol, and graph state.
- Migrations applied so far: `init`, `memory_episode`, `memory_episode-reconcile`, `task_graph_state` (4 total). Pass 15 adds no migration.
- `task_graph_state` rows are authoritative for worker graph progress; `state.json` Worker CRUD is advisory only.
- Resume semantics unchanged from pass 10.
- `EmbeddingProvider` factory selects `VertexEmbeddingProvider` when `GEMINI_API_KEY` is set, else `StubEmbeddingProvider`. Singleton per process; `resetEmbeddingProvider` is a test-only hook.
- StateGraph transitions remain atomic (`prisma.$transaction` + `FOR UPDATE`).
- Raw SQL via `Prisma.sql`. No string concatenation.
- `lib/` does not import from `scripts/`.

## Deletions confirmed
- (none this pass)

## Open issues carrying forward
- Symbol seeder script (`scripts/seed-code-symbols.ts`) — target post-pass-20 maintenance pass; empty index is tolerated.
- 13 extra Tailwind files (pass 3 residue) — pending user scope decision.
- Scheduler / Cloud Scheduler wiring for watchdog + pool-manager cadence — deferred to pass 20 when `cloudbuild.yaml` is allowed to change.
- `scripts/swarm/__tests__/provider-contract.test.ts` empty-file jest suite — scheduled for pass 20 cull.
- Swarm lint warnings at 69 (up from 62 pass-14 due to intentional interface-impl unused parameters prefixed with `_` in new fakes; still ≤79 ceiling) — scheduled for pass 20 cull.
- `resume-worker.integration.test.ts` requires `DB_TEST=1` + Cloud SQL proxy — not wired into CI.
- Dead-code cull (including residual `withStateLock` machinery) — pass 20.
- Worker-JSON (`state.json`) legacy advisory CRUD — pass 20 cull candidate.

## Next-5-passes context payload
Passes 16–20 take the unified state + dynamic context + role-separated loop to production. **Pass 16**: wire SCION components (`scion-dashboard.tsx`, `TopographyTree.tsx`, `GoalTracker.tsx`, `IssueInbox.tsx`, `GlobalLedger.tsx`) through SWR against unified `Issue` + `TaskGraphState`; `/api/scion/execute` creates graph-rooted Issues for the heartbeat dispatcher; `/api/orchestrator/stream` emits real SSE off OTEL spans keyed on `taskId`; `BudgetLedger` accumulates real per-task spend from `providers.ts`. **Pass 17**: wrap Paperclip behind `providers.ts::Provider`; `PAPERCLIP_PROXY_URL` / `PAPERCLIP_MODEL` become config; opt-in for `1_qa` and `local_only: true` categories. **Pass 18**: unify observability — every node transition emits an OTEL span tagged `(taskId, role, node, modelId, providerCost)`; Jaeger shows actor/critic + exploration; trace summaries feed `BuildContextInput.recentTraceSummaries`. **Pass 19** (deferrable): Turn-PPO seam — `lib/rl/turn-critic.ts` interface + `recordTurnAdvantage` no-op writer to `turn_advantage`; no training. **Pass 20**: cull dead code, update `CLAUDE.md`, write `ARCHITECTURE.md`, bump version, execute the single Cloud Build deploy, smoke-test `/api/orchestrator/heartbeat`.
