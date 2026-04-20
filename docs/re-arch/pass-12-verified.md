# Pass 12 verified

**Cycles**: 1. **Verdict**: PASS.

## What's now true
- Rubric registry at `lib/orchestration/rubrics/`: `types.ts`, `default.ts`, `1_qa.ts`, `2_source_control.ts`, `3_cloud.ts`, `4_db.ts`, `5_bizops.ts`, `index.ts` with `loadRubric(category) → Rubric` (static imports only).
- Each category rubric has meaningful, non-generic check ids (e.g. `region_is_asia_southeast1`, `migration_additive_only`, `cites_failing_test_path`).
- `scripts/swarm/roles/orchestrator.ts` accepts `agentCategory` and looks up the rubric via `loadRubric` before the loop.
- `scripts/swarm/runner/nodes.ts` `propose_plan` + `execute_step` + `evaluate_completion`: on `runActorCriticLoop` exhaustion → writes `Issue.status = "needs_human"` AND sets `task_graph_state.status = "interrupted"` with `interruptReason = "actor_critic_exhausted"`.
- `Issue.status` stays `String` (not a Prisma enum) — no migration needed. `prisma migrate status` confirms no drift.
- `scripts/swarm/roles/rubrics/default.ts` deleted (moved to `lib/`); repo-wide Grep shows zero live refs.
- Test gate: `prisma validate`, `test:types`, `test:swarm:types`, `npm test` (6 suites / 55 tests + 1 skipped), `lint` (0 errors / 59 warnings), `npm run build` — all PASS. Rubric registry 14/14, actor-critic 9/9, nodes 17/17.

## Frozen this pass
- Rubric registry location: `lib/orchestration/rubrics/`. App code (SCION, API routes) and swarm code both import from here.
- Rubric interface assignment-compatible with `CriticInput["rubric"]`. Changes to either shape are breaking.
- Exhaustion-to-human handoff contract: `Issue.status = "needs_human"`, `task_graph_state.status = "interrupted"`, `interruptReason = "actor_critic_exhausted"`.

## Open carry-forward
- 13 extra Tailwind files, scheduler wiring, 59 lint warnings, dead-code cull — unchanged.
- Pass 13 adds runtime prompt-isolation enforcement on top of pass 11's type-level boundary.
