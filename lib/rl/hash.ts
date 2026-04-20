// Pass 19 — State-hash helper for Turn-PPO snapshots.
//
// Returns a 16-char hex prefix of a SHA-256 over `JSON.stringify(ctx)`.
// This is NOT cryptographically sensitive — it is a collision-avoidance
// identifier so two snapshots taken against materially different contexts
// don't share a `stateHash`. Callers that need real integrity guarantees
// must use the full digest through `crypto` directly.
//
// SDK signature verified against:
//   node_modules/@types/node/crypto.d.ts — `createHash(algorithm: string)`
//   returns a `Hash` instance with `update(data)` and `digest('hex')`.

import { createHash } from "crypto";

const HASH_LENGTH = 16;

function stableStringify(value: unknown): string {
  // Plain JSON.stringify is sufficient for the collision-avoidance purpose.
  // Object key order is left to the caller; two inputs with reordered keys
  // will hash differently, which is acceptable for this use case.
  try {
    return JSON.stringify(value);
  } catch {
    // Defensive fallback for circular references — degrade to a stable
    // placeholder rather than crashing the orchestrator hook.
    return "[unserializable]";
  }
}

/**
 * 16-char collision-avoidance identifier derived from the JSON
 * serialization of `ctx`. Documented in `./types.ts` as non-sensitive.
 */
export function hashState(ctx: unknown): string {
  const serialized = stableStringify(ctx);
  return createHash("sha256")
    .update(serialized)
    .digest("hex")
    .slice(0, HASH_LENGTH);
}
