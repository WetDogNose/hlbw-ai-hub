# Pass 11 verified

**Cycles**: 1. **Verdict**: PASS.

## What's now true
- Three specialized roles under `scripts/swarm/roles/`:
  - `actor.ts` — `propose(input, provider, modelId) → ActorProposal`. Prompt template excludes any Critic rubric. Includes last `critique` on rework.
  - `critic.ts` — `evaluate(input, provider, modelId) → CriticVerdict`. `CriticInput.proposal` typed `Pick<ActorProposal, "kind"|"plan"|"toolCall"|"finalMessage">` — compile error if anyone tries to pass `rawModelReasoning`.
  - `orchestrator.ts` — `runActorCriticLoop(input, rubric, provider, modelId, opts) → approved | exhausted`. Default: `maxReworkCycles=3`, `minConfidenceForPass=0.85`. Early-stop on PASS + confidence ≥ threshold.
- Placeholder `scripts/swarm/roles/rubrics/default.ts` with 3 checks (`progress`, `grounded`, `minimal`). Pass 12 builds the full registry.
- `runner/nodes.ts` `propose_plan` and `execute_step` now call `runActorCriticLoop` instead of raw Gemini. `record_observation`, `init_mcp`, `build_context`, `evaluate_completion`, `commit_or_loop` untouched.
- Test gate: `prisma validate`, `test:types`, `test:swarm:types`, `npm test` (5 suites / 39 tests + 1 skipped), `lint` (0 errors / 59 warnings), `actor-critic.test.ts` 7/7, `nodes.test.ts` 16/16, `npm run build` — all PASS.
- `getOrCreateModel` deleted after repo-wide Grep showed zero live callers. Gemini inference now flows only via `LLMProviderAdapter`.

## Frozen this pass
- Role boundary is type-level: `CriticInput.proposal` cannot accept `rawModelReasoning`. `orchestrator.ts` destructures explicitly (no `...proposal` spread). Pass 13 adds runtime enforcement on top.
- Orchestrator return shape: `{kind: "approved", proposal, cyclesUsed, lastVerdict}` or `{kind: "exhausted", lastProposal, cyclesUsed, lastVerdict}`. New outcome types are breaking changes.
- Provider type: `LLMProviderAdapter` (not `Provider`) — the real export from `scripts/swarm/providers.ts`.
- Default rubric location is `scripts/swarm/roles/rubrics/` for now; pass 12 migrates to `lib/orchestration/rubrics/` and adds per-category rubrics.

## Open carry-forward
- 13 extra Tailwind files, scheduler wiring, 59 lint warnings, worker-JSON cull — unchanged.
- Rubric migration to `lib/orchestration/rubrics/` — pass 12.
- `needs_human` task status on orchestrator exhaustion — pass 12 job.
