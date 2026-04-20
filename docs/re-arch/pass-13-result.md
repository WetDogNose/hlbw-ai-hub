# Pass 13 result

## Changed files
- `lib/orchestration/prompts/render.ts`: new — central renderer with branded `ActorPrompt`/`CriticPrompt`, `StrictActorInput`/`StrictCriticInput`/`StrictCriticProposal` shapes, runtime-guarded `renderCriticPrompt` rejecting banned keys `rawModelReasoning`/`chatHistory`/`systemPrompt`.
- `scripts/swarm/roles/actor.ts`: `renderActorPrompt` delegates to `lib/orchestration/prompts/render.ts`; signature now returns `ActorPrompt` brand.
- `scripts/swarm/roles/critic.ts`: `renderCriticPrompt` delegates to the central renderer; returns `CriticPrompt` brand.
- `scripts/swarm/roles/orchestrator.ts`: `runSingleCycle` builds the `CriticInput` via explicit destructure `{ kind, plan, toolCall, finalMessage } = proposal`. The prior `stripReasoning()` helper was removed in favour of the inline destructure the spread-grep test greps for.
- `lib/orchestration/prompts/__tests__/render.test.ts`: new — unit tests for the renderer (happy path + banned-key runtime guard paths + brand compile check).
- `scripts/swarm/roles/__tests__/context-isolation.test.ts`: new — grep test on `orchestrator.ts` source, runtime-guard bypass tests, end-to-end test asserting `rawModelReasoning` never reaches the Critic prompt.

## New symbols (with location)
- `renderActorPrompt` at `lib/orchestration/prompts/render.ts:87`
- `renderCriticPrompt` at `lib/orchestration/prompts/render.ts:125`
- `CRITIC_BANNED_KEYS` at `lib/orchestration/prompts/render.ts:63`
- `ActorPrompt` at `lib/orchestration/prompts/render.ts:55`
- `CriticPrompt` at `lib/orchestration/prompts/render.ts:56`
- `StrictActorInput` at `lib/orchestration/prompts/render.ts:26`
- `StrictCriticProposal` at `lib/orchestration/prompts/render.ts:39`
- `StrictCriticInput` at `lib/orchestration/prompts/render.ts:46`

## Deleted symbols
- `stripReasoning` (was at `scripts/swarm/roles/orchestrator.ts`) — helper folded inline into `runSingleCycle` as an explicit destructure so the new grep-based context-isolation test can enforce no-spread discipline. Grep across `c:/Users/Jason/repos/{hlbw-ai-hub,wot-box,genkit,adk-python,adk-js}` for `stripReasoning` returns zero live refs (the symbol was module-private in `orchestrator.ts` and not exported).

## New deps
- none.

## Verifier output
- npx prisma validate: PASS (`The schema at prisma\schema.prisma is valid`).
- npm run test:types: PASS (exit 0).
- npm run test:swarm:types: PASS (exit 0).
- npm test: PASS (8 suites / 69 tests + 1 skipped integration; includes new `lib/orchestration/prompts/__tests__/render.test.ts` and `scripts/swarm/roles/__tests__/context-isolation.test.ts`).
- npm run lint: PASS (0 errors, 59 warnings — identical count to pass 12 baseline, below the ≤79 cap).
- npx jest scripts/swarm/roles/__tests__/context-isolation.test.ts: PASS (1 suite / 4 tests).
- npx jest scripts/swarm/roles/__tests__/actor-critic.test.ts: PASS (1 suite / 9 tests, unchanged).
- npm run build: PASS (exit 0, Next.js production build).

## Open issues / deferred
- 13 extra Tailwind files, scheduler wiring, lint-warning cull, dead-code cull — unchanged from pass 12.
- `lib/orchestration/prompts/` has no sibling directories yet; pass 15 may add a `windows/` subfolder for the dynamic context-window packer.

## Cross-repo impact
- none.
