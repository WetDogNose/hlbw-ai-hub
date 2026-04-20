# Pass 12 result

## Changed files
- `lib/orchestration/rubrics/types.ts`: new — `Rubric` + `RubricCheck` types re-declared in `lib/` so the registry has no reverse import from `scripts/`.
- `lib/orchestration/rubrics/default.ts`: new — `DEFAULT_RUBRIC` moved out of `scripts/swarm/roles/rubrics/default.ts`.
- `lib/orchestration/rubrics/1_qa.ts`: new — `QA_RUBRIC` with 3 checks (`proposes_test_not_assertion`, `cites_failing_test_path`, `flakiness_risk_assessed`).
- `lib/orchestration/rubrics/2_source_control.ts`: new — `SOURCE_CONTROL_RUBRIC` with 3 checks (`branch_name_convention`, `commit_message_has_why`, `no_force_push`).
- `lib/orchestration/rubrics/3_cloud.ts`: new — `CLOUD_RUBRIC` with 3 checks (`region_is_asia_southeast1`, `no_destructive_infra_op`, `cost_mentioned`).
- `lib/orchestration/rubrics/4_db.ts`: new — `DB_RUBRIC` with 3 checks (`migration_additive_only`, `backfill_explicit`, `no_accept_data_loss`).
- `lib/orchestration/rubrics/5_bizops.ts`: new — `BIZOPS_RUBRIC` with 3 checks (`stakeholder_identified`, `success_metric_named`, `rollback_plan_sketched`).
- `lib/orchestration/rubrics/index.ts`: new — static registry + `loadRubric(category)` pure function. Null/undefined/empty/unknown → `DEFAULT_RUBRIC`.
- `scripts/swarm/roles/orchestrator.ts`: added `agentCategory` to `OrchestratorOptions` and a new category-aware entry point `runActorCriticLoopForCategory(input, category, provider, modelId, opts)` that resolves the rubric via `loadRubric`. `runActorCriticLoop(input, rubric, ...)` signature unchanged.
- `scripts/swarm/runner/nodes.ts`: `propose_plan`, `execute_step`, and `evaluate_completion` now call `loadRubric(rc.agentCategory)` instead of hard-coding `DEFAULT_RUBRIC`. On `runActorCriticLoop` exhaustion each node calls `markIssueNeedsHuman(rc.taskId)` (flips `Issue.status` to `"needs_human"`) and returns `{kind: "interrupt", reason: INTERRUPT_REASON_ACTOR_CRITIC_EXHAUSTED}`. `evaluate_completion`'s DONE-token heuristic replaced with an Actor/Critic cycle: `tool_call` → goto `execute_step`; `plan`/`final_message` approved → goto `commit_or_loop` with `completionReason: "critic_approved"`; iteration-budget cap still short-circuits to `commit_or_loop` with `completionReason: "max_iterations"` before consuming any provider calls.
- `scripts/swarm/types.ts`: added `TaskStatus.NeedsHuman = "needs_human"` to the enum and to `normalizeStatus` so `toTask()` preserves the value on round-trips.
- `prisma/schema.prisma`: extended the `Issue.status` inline comment to include `needs_human` (column type unchanged — `String` default `"pending"`). No migration required.
- `scripts/swarm/roles/__tests__/actor-critic.test.ts`: import path for `DEFAULT_RUBRIC` changed to `@/lib/orchestration/rubrics`. Added one describe block (`runActorCriticLoop exhaustion (pass 12)`) with two tests covering `runActorCriticLoopForCategory` — 3-REWORK exhaustion + QA rubric resolution.
- `scripts/swarm/runner/__tests__/nodes.test.ts`: mocked `@/lib/prisma` at module scope; added `issueUpdateMock` assertion in three tests (plan exhaustion, step exhaustion, evaluate exhaustion). Replaced the pass-11 `DONE`-token tests with pass-12 Actor/Critic semantics: `critic_approved` routes to `commit_or_loop`, `tool_call` loops back to `execute_step`, `max_iterations` still short-circuits without consuming provider calls.
- `scripts/swarm/roles/__tests__/rubric-registry.test.ts`: new — 14 tests (`loadRubric` across all 6 categories + null/undefined/empty/unknown fallbacks + check-count / id-format invariants + name/key parity).

## New symbols (with location)
- `Rubric` at `lib/orchestration/rubrics/types.ts:10`
- `RubricCheck` at `lib/orchestration/rubrics/types.ts:5`
- `DEFAULT_RUBRIC` at `lib/orchestration/rubrics/default.ts:8`
- `QA_RUBRIC` at `lib/orchestration/rubrics/1_qa.ts:9`
- `SOURCE_CONTROL_RUBRIC` at `lib/orchestration/rubrics/2_source_control.ts:9`
- `CLOUD_RUBRIC` at `lib/orchestration/rubrics/3_cloud.ts:11`
- `DB_RUBRIC` at `lib/orchestration/rubrics/4_db.ts:10`
- `BIZOPS_RUBRIC` at `lib/orchestration/rubrics/5_bizops.ts:11`
- `loadRubric` at `lib/orchestration/rubrics/index.ts:44`
- `runActorCriticLoopForCategory` at `scripts/swarm/roles/orchestrator.ts:157`
- `markIssueNeedsHuman` at `scripts/swarm/runner/nodes.ts:394`
- `INTERRUPT_REASON_ACTOR_CRITIC_EXHAUSTED` at `scripts/swarm/runner/nodes.ts:58`
- `TaskStatus.NeedsHuman` at `scripts/swarm/types.ts:11`

## Deleted symbols
- `DEFAULT_RUBRIC` (was at `scripts/swarm/roles/rubrics/default.ts:9`) — entire file removed. Grep across `c:/Users/Jason/repos/{hlbw-ai-hub,wot-box,genkit,adk-python,adk-js}` for `roles/rubrics/default` and `roles\rubrics\default` returned zero live code hits. The single caller (`scripts/swarm/runner/nodes.ts`) and one test (`scripts/swarm/roles/__tests__/actor-critic.test.ts`) migrated to `@/lib/orchestration/rubrics` before deletion. Remaining hits are narrative prose in `docs/re-arch/pass-11-result.md`, `docs/re-arch/pass-11-verified.md`, and a moved-from comment in `lib/orchestration/rubrics/default.ts:3`.

## New deps
- none

## Verifier output
- `npx prisma validate`: PASS (`The schema at prisma\schema.prisma is valid`, exit 0).
- `npm run test:types`: PASS (exit 0).
- `npm run test:swarm:types`: PASS (exit 0).
- `npm test`: PASS — 6 suites passed, 1 skipped, 55 tests passed, 1 skipped.
- `npm run lint`: PASS — 0 errors, 59 warnings (unchanged from pass 11; cap 79).
- `npx jest scripts/swarm/roles/__tests__/rubric-registry.test.ts`: PASS — 1 suite, 14/14 tests.
- `npx jest scripts/swarm/roles/__tests__/actor-critic.test.ts`: PASS — 1 suite, 9/9 tests (includes the pass-12 exhaustion and QA-rubric resolution tests).
- `npx jest --config jest.config.ts --testPathIgnorePatterns='/node_modules/' --roots '<rootDir>/scripts/swarm/runner/__tests__/' --testRegex 'nodes\.test\.ts$'`: PASS — 1 suite, 17/17 tests (includes the three pass-12 needs_human interrupt assertions via the `issueUpdateMock`).
- `npm run build`: PASS (Next.js production build completed, exit 0).

## Open issues / deferred
- `Issue.status` column remains a Postgres `String` — no enum, no migration. If a later pass introduces a Prisma enum for task status, `needs_human` is already in `TaskStatus` and `normalizeStatus` so the conversion is mechanical.
- Scheduler / Cloud Scheduler wiring, 13 Tailwind files, 59 lint warnings, and the `resume-worker.integration.test.ts` DB-gated suite all remain deferred per `checkpoint-10.md`.
- Pass 13 adds the type-level `CriticInput` / `ActorInput` render boundary; this pass kept `runActorCriticLoop` signature stable so pass 13 can layer on top.

## Cross-repo impact
- none

## Migration
- No migration drafted. `Issue.status` is a `String` column (see `prisma/schema.prisma:194`); writing `"needs_human"` requires no schema change. Only the inline comment in `prisma/schema.prisma` was widened to include the new value.
