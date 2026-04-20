// Pass 19 — TurnCritic factory.
//
// Process-level singleton. Callers that need a different implementation for
// tests do so via `jest.mock('@/lib/rl')` — see the `orchestrator-hook.test.ts`
// and `NoopTurnCritic.test.ts` suites for the established pattern.
//
// TODO: once a real PPO implementation lands (e.g. `PpoTurnCritic`), branch
// on `process.env.TURN_CRITIC`:
//   - `TURN_CRITIC=noop` (default) → NoopTurnCritic
//   - `TURN_CRITIC=ppo_v1`        → new PpoTurnCritic()
// Keep the factory in this file; do not plumb the env var through
// orchestrator call sites. The seam is the whole point of this pass.

import type { TurnCritic } from "./types";
import { NoopTurnCritic } from "./NoopTurnCritic";

let singleton: TurnCritic | undefined;

export function getTurnCritic(): TurnCritic {
  if (!singleton) {
    singleton = new NoopTurnCritic();
  }
  return singleton;
}

/**
 * Test-only hook. Replaces the singleton so a suite can inject a spy or
 * stub without going through `jest.mock`. Mirrors
 * `resetEmbeddingProvider` from the pass-15 embedding factory.
 */
export function setTurnCritic(critic: TurnCritic | undefined): void {
  singleton = critic;
}

export { hashState } from "./hash";
export type { TurnCritic, TurnSnapshot, TurnAdvantage } from "./types";
