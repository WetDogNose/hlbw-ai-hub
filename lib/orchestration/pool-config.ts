// Pool configuration helper.
//
// Resolves the effective warm-worker count with a three-tier precedence:
//   1. explicit caller argument,
//   2. runtime-config `pool_warm_count`,
//   3. hardcoded default (21).
//
// Clamped to WORKER_COUNT_CEILING so a bad runtime-config write can't spawn
// an arbitrary number of containers. Lives in `lib/` (not `scripts/`) so the
// test suite (which excludes `scripts/swarm/__tests__/`) can exercise it
// through the normal Jest path and the Next.js server-side callers can reuse
// it in e.g. a pool-status API without pulling in the `scripts/` tree.

import { getRuntimeConfig } from "./runtime-config";

export const DEFAULT_WORKER_COUNT = 21;
export const WORKER_COUNT_CEILING = 64;

export async function resolveWorkerCount(explicit?: number): Promise<number> {
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return Math.max(0, Math.min(WORKER_COUNT_CEILING, Math.floor(explicit)));
  }
  try {
    const eff = await getRuntimeConfig(
      "pool_warm_count",
      "SCION_POOL_WARM_COUNT",
      DEFAULT_WORKER_COUNT,
    );
    const v = eff.value;
    if (typeof v === "number" && Number.isFinite(v)) {
      return Math.max(0, Math.min(WORKER_COUNT_CEILING, Math.floor(v)));
    }
  } catch {
    // Fall through to default so a broken runtime-config row doesn't block
    // pool boot.
  }
  return DEFAULT_WORKER_COUNT;
}
