# Pass 19 result

## Changed files
- `lib/rl/types.ts`: new — `TurnSnapshot`, `TurnAdvantage`, `TurnCritic` interface contracts.
- `lib/rl/hash.ts`: new — `hashState(ctx)` 16-char SHA-256 prefix (collision-avoidance identifier, NOT cryptographic).
- `lib/rl/NoopTurnCritic.ts`: new — default `TurnCritic` implementation. Writes `MemoryEpisode` rows (`kind: "entity"`, discriminated `content.kind: "turn_snapshot" | "turn_advantage"`). No schema change; pass-15 storage convention reused.
- `lib/rl/index.ts`: new — factory `getTurnCritic()` + test hook `setTurnCritic()` + re-export of `hashState` and types. Factory has a `TODO` marker for the `TURN_CRITIC=ppo_v1` branch.
- `lib/rl/policies/README.md`: new — describes future PPO implementation, three numerical knobs (lr, clip epsilon, gamma), and the plug-in contract. ≤200 lines.
- `lib/rl/__tests__/hash.test.ts`: new — hash determinism, length, different-inputs-different-outputs, unserializable-input handling.
- `lib/rl/__tests__/NoopTurnCritic.test.ts`: new — `recordTurn` writes exactly 1 row, `estimateValue` returns 0, `computeAdvantage` yields `advantage = reward - 0`, writes one row per advantage, factory singleton identity.
- `scripts/swarm/roles/orchestrator.ts`: edited — imports `getTurnCritic, hashState, TurnSnapshot` from `@/lib/rl`. Per-cycle: builds snapshot (taskId, node=`actor_critic_cycle`, role=`orchestrator`, stateHash, action kind/summary, outcome=`ok`, rewardSignal=`verdict.confidence`, duration, modelId, timestamp) and calls `getTurnCritic().recordTurn(snap)` inside an `RL:recordTurn` OTEL span wrapped in try/catch (RL failures never surface). At loop end (both approved and exhausted paths): fires-and-forgets `getTurnCritic().computeAdvantage(history, rewards)` with `rewards[i] === lastVerdict.confidence` per cycle; errors swallowed.
- `scripts/swarm/roles/__tests__/orchestrator-hook.test.ts`: new — mocks `@/lib/rl`; asserts `recordTurn` called once per cycle (1-cycle PASS, 3-cycle rework), orchestrator still returns when `recordTurn` throws, `computeAdvantage` called fire-and-forget on both approved and exhausted paths with rewards mirroring `verdict.confidence`.
- `lib/orchestration/graph/StateGraph.ts`: edited — imports `getTurnCritic, hashState, TurnSnapshot, SPAN_ROLE`. After the `$transaction` settles (success or error), builds a `TurnSnapshot` from context (`node`, `modelId`, `stateHash`) + outcome and calls `getTurnCritic().recordTurn(snap)` inside a dedicated `RL:recordTurn` span wrapped in try/catch. Re-throws the original transaction error after recording, so the public return shape is unchanged.
- `lib/orchestration/graph/__tests__/StateGraph.test.ts`: edited — added `@/lib/rl` mock capturing recorded turns and a `recordTurnShouldThrow` toggle. New tests: "recordTurn called once on success path", "recordTurn outcome=error on thrown node", "transition still returns when recordTurn throws". Existing pass-18 span assertions updated to find `Graph:a` by span name (buffer now also carries the `RL:recordTurn` span).

## New symbols (with location)
- `TurnSnapshot` at `lib/rl/types.ts:19`
- `TurnAdvantage` at `lib/rl/types.ts:40`
- `TurnCritic` at `lib/rl/types.ts:55`
- `hashState` at `lib/rl/hash.ts:34`
- `NoopTurnCritic` at `lib/rl/NoopTurnCritic.ts:36`
- `getTurnCritic` at `lib/rl/index.ts:19`
- `setTurnCritic` at `lib/rl/index.ts:31`

## Deleted symbols
- (none)

## New deps
- (none — all imports resolve against existing `@prisma/client`, `crypto` (Node built-in, types in `node_modules/@types/node`), `@opentelemetry/api`, and the pass-7 `MemoryStore` contract. SDK signatures verified against: `node_modules/@types/node/crypto.d.ts` for `createHash(algorithm)` → `Hash.update(...).digest("hex")`; `lib/orchestration/memory/MemoryStore.ts:MemoryStore.write`; `lib/orchestration/memory/PgvectorMemoryStore.ts:getPgvectorMemoryStore`.)

## Verifier output
- `npx prisma validate`: PASS (exit 0 — "The schema at prisma\schema.prisma is valid").
- `npm run test:types`: PASS (exit 0 — `tsc --noEmit` clean).
- `npm run test:swarm:types`: PASS (exit 0 — `tsc --noEmit -p scripts/tsconfig.json` clean).
- `npm test`: PASS — 20 of 21 suites passed, 1 skipped (same skipped suite as pass 18 — `resume-worker.integration.test.ts` DB-gated). 141 tests passed, 1 skipped. +3 suites vs pass-18 baseline (hash.test.ts, NoopTurnCritic.test.ts, orchestrator-hook.test.ts).
- `npm run lint`: PASS — 0 errors, 71 warnings (≤79 ceiling; pass-18 baseline was 70, +1 from `_snap` unused parameter in `NoopTurnCritic.estimateValue` which implements the `TurnCritic` interface contract).
- `npm run build`: PASS (Next.js production build green; route manifest unchanged).

## Open issues / deferred
- PPO training implementation: deferred indefinitely (D2). The seam is now in place; adding a concrete `PpoTurnCritic` is a future pass that touches ONLY `lib/rl/` (factory branch + new file) and requires zero orchestrator/StateGraph edits.
- Empty pg vector on `turn_snapshot` / `turn_advantage` rows: `NoopTurnCritic` writes content only, no embedding. Future PPO work can add embeddings if needed.
- Symbol seeder, 13 extra Tailwind files, scheduler wiring, 71 lint warnings, worker-JSON cull — unchanged carry-forward from checkpoint-15 / pass-18-verified.

## Cross-repo impact
- none
