# Pass 14 result

Directive #2 — exploration budget / test-time interaction scaling.

## Changed files
- `lib/orchestration/explorer.ts`: new module — `ExplorationContext`, `ExplorationStep`, `ExplorationOutcome`, `proposeExplorationStep`, `filterReadOnlyTools`, structural `LLMProviderAdapter` mirror.
- `scripts/swarm/runner/nodes.ts`: inserted new `explore` node between `build_context` and `propose_plan`; extended `RunnerContext` with `explorationBudget` / `explorationHistory` / `explorationNotes`; `build_context` now routes to `explore`; `propose_plan` surfaces `explorationNotes` to the Actor; MCP + synthetic test-only dispatch for exploration steps; OTEL span per step.
- `scripts/swarm/roles/actor.ts`: `ActorInput` now carries optional `explorationNotes`; `renderActorPrompt` threads it into `StrictActorInput`.
- `lib/orchestration/prompts/render.ts`: `StrictActorInput` now carries optional `explorationNotes`; `renderActorPrompt` emits a "Prior exploration findings" section.
- `scripts/swarm/agent-runner.ts`: `graph.start()` initialises `explorationBudget` (default 8, env override `AGENT_EXPLORATION_BUDGET`) and empty `explorationHistory`.
- `scripts/swarm/runner/__tests__/nodes.test.ts`: updated node-count expectation (7 -> 8) and `build_context` destination (`propose_plan` -> `explore`).
- `scripts/swarm/runner/__tests__/explore-node.test.ts`: new — tests A/B/C/D covering stop, self-loop with budget decrement, zero-budget short-circuit, and read-only filter.
- `lib/orchestration/__tests__/explorer.test.ts`: new — `filterReadOnlyTools` allow-list coverage + `proposeExplorationStep` round-trip, stop, non-allowed-tool rejection, and unparseable-response paths.

## New symbols (with location)
- `LLMProviderAdapter` (structural mirror) at `lib/orchestration/explorer.ts:35`
- `ReadOnlyTool` at `lib/orchestration/explorer.ts:62`
- `ExplorationStep` at `lib/orchestration/explorer.ts:68`
- `ExplorationContext` at `lib/orchestration/explorer.ts:76`
- `ExplorationOutcome` at `lib/orchestration/explorer.ts:86`
- `filterReadOnlyTools` at `lib/orchestration/explorer.ts:138`
- `proposeExplorationStep` at `lib/orchestration/explorer.ts:293`
- `NODE_EXPLORE` at `scripts/swarm/runner/nodes.ts:441`
- `exploreNode` at `scripts/swarm/runner/nodes.ts:604`
- `explorationBudget` / `explorationHistory` / `explorationNotes` (fields on `RunnerContext`) at `scripts/swarm/runner/nodes.ts` (extended interface)
- `explorationNotes?` (field on `ActorInput`) at `scripts/swarm/roles/actor.ts`
- `explorationNotes?` (field on `StrictActorInput`) at `lib/orchestration/prompts/render.ts`

## Deleted symbols
- none

## New deps
- none

## Verifier output
- `npx prisma validate`: PASS (exit 0)
- `npm run test:types`: PASS (exit 0)
- `npm run test:swarm:types`: PASS (exit 0)
- `npm test`: PASS (9 suites / 79 tests + 1 skipped; `explorer.test.ts` under `lib/orchestration/__tests__/` added, taking the suite count from 8 to 9)
- `npm run lint`: PASS (0 errors, 62 warnings — within the ≤79 ceiling)
- `npx jest scripts/swarm/runner/__tests__/explore-node.test.ts` (via `--roots <rootDir>/scripts/swarm/runner/__tests__/ --testRegex 'explore-node\.test\.ts$' --testPathIgnorePatterns '/node_modules/'`): PASS (1 suite / 4 tests)
- `npx jest scripts/swarm/runner/__tests__/nodes.test.ts` (same override recipe, regex `'nodes\.test\.ts$'`): PASS (1 suite / 17 tests — topology test updated from 7 to 8 nodes, `build_context` test updated to assert `NODE_EXPLORE`)
- `npm run build`: PASS (exit 0 — 25 static pages generated, no type errors in Next build)

## Open issues / deferred
- The `explore` node's synthetic `Read`/`Grep`/`Glob` fallback is gated on `NODE_ENV === "test"` and exists only so test runs without a booted MCP client still exercise the step-dispatch path. Production remains MCP-only. Replace with the pass-15 dynamic context builder's tool invocation path when pass 15 lands.
- `task_graph_state` schema carries `explorationBudget`/`explorationHistory`/`explorationNotes` inside the existing `context Json` column (same pattern pass-10 used for the Worker fold). No prisma migration required.
- Self-loop cadence is bounded by the budget (default 8) + the graph runtime's own transition cap. No per-budget cycle accounting beyond the explicit decrement.
- Hedge-free per rule 9. Commit-only; no deploys.

## Cross-repo impact
- none
