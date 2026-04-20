# Pass 13 verified

**Cycles**: 1. **Verdict**: PASS.

## What's now true
- Central prompt renderer at `lib/orchestration/prompts/render.ts` with branded types `ActorPrompt` and `CriticPrompt` (string & { __brand: ... }). Prevents structural mixing at the type level.
- `renderCriticPrompt` runtime guard: throws on any banned key (`rawModelReasoning`, `chatHistory`, `systemPrompt`) at top level OR inside `proposal`.
- `actor.ts` / `critic.ts` rewired to render via the central module.
- `orchestrator.ts` constructs `CriticInput` via explicit destructure `{ kind, plan, toolCall, finalMessage }` — no `...proposal` spread anywhere in the 3 role files.
- Triple boundary tests: (a) grep test for zero `...proposal` spreads, (b) runtime-guard throws on banned key, (c) scripted Actor+Critic capture confirms Critic prompt never contains "rawModelReasoning".
- Test gate: `prisma validate`, `test:types`, `test:swarm:types`, `npm test` (8 suites / 69 tests + 1 skipped), `lint` (0 errors / 59 warnings), `context-isolation.test.ts` 4/4, `render.test.ts` all PASS, `npm run build` — all PASS.

## Frozen this pass
- `renderActorPrompt` and `renderCriticPrompt` are the SOLE approved prompt-construction entry points. Direct string templating of prompts elsewhere is forbidden by convention (Critic rubric C1 greps would catch new offenders).
- Banned-key list for CriticInput: `rawModelReasoning`, `chatHistory`, `systemPrompt`. Adding a new Actor-internal field? Must also add it to the banned list.

## Open carry-forward
- 13 extra Tailwind files, scheduler wiring, 59 lint warnings, dead-code cull, worker-JSON — unchanged.
