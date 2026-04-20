# Pass 14 verified

**Cycles**: 1. **Verdict**: PASS.

## What's now true
- `lib/orchestration/explorer.ts`: `ExplorationContext`, `ExplorationStep`, `ExplorationOutcome`, `proposeExplorationStep`, `filterReadOnlyTools`.
- `filterReadOnlyTools` allow-list: prefixes `get_`/`list_`/`read_`/`grep_`/`search_`/`query_`, exact names `Read`/`Grep`/`Glob`, and MCP names containing `_read`/`_get`/`_list`. Deterministic, pure, commented.
- New `explore` graph node inserted between `build_context` and `propose_plan`. Self-loops via `{kind:"goto", next:"explore"}`. Budget decrements per iteration; routes to `propose_plan` on `stop` OR when budget reaches 0.
- `RunnerContext` gains `explorationBudget: 8` (default; override via `AGENT_EXPLORATION_BUDGET` env), `explorationHistory: ExplorationStep[]`, optional `explorationNotes`.
- `ActorInput.explorationNotes?` — renderer surfaces it in the Actor prompt.
- OTEL spans per exploration step.
- Test gate: `prisma validate`, `test:types`, `test:swarm:types`, `npm test` (9 suites / 79 tests + 1 skipped), `lint` (0 errors / 62 warnings), `explore-node.test.ts` 4/4, `nodes.test.ts` 17/17, `explorer.test.ts` 10/10, `npm run build` — all PASS.

## Frozen this pass
- Graph topology: `init_mcp` → `build_context` → `explore` (self-looping) → `propose_plan` → `execute_step` ⇄ `record_observation` ⇄ `evaluate_completion` → `commit_or_loop`. Pass 15 rewrites `build_context`'s body but the position stays.
- Exploration tools are a read-only subset — by contract, enforced by `filterReadOnlyTools`.
- `explore` must be a graph-level self-loop, not an in-node while-loop. Preserves resume semantics.

## Open carry-forward
- 13 extra Tailwind files, scheduler wiring, 62 lint warnings, worker-JSON, dead-code cull — unchanged.
- Pass 15 compaction boundary approaching (checkpoint-15).
