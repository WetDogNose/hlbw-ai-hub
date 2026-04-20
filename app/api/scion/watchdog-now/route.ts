// Pass 22 — admin button that fires the watchdog in-process.
//
// POST /api/scion/watchdog-now
// Invokes `reclaimStaleWorkers` (same Issue-level reclaim as the heartbeat)
// plus a thin graph-level interrupt sweep. The full `runWatchdog()` function
// lives under `scripts/swarm/` which the Next.js build excludes from its
// module graph (see tsconfig split); running it would require a subprocess.
// For now this route reclaims at the Issue level — the graph-level sweep is
// owned by `scripts/swarm/watchdog.ts` and can be invoked via `npx tsx`.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import { reclaimStaleWorkers } from "@/lib/orchestration/dispatcher";

export interface ScionWatchdogNowResponse {
  reclaimed: number;
  elapsedMs: number;
}

export async function POST(): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  const startedAt = Date.now();
  try {
    const reclaimed = await reclaimStaleWorkers();
    const elapsedMs = Date.now() - startedAt;
    await recordAdminAction(user, "orchestrator.watchdog_now", {
      reclaimed,
      elapsedMs,
    });
    const body: ScionWatchdogNowResponse = { reclaimed, elapsedMs };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "watchdog-now failed";
    console.error("/api/scion/watchdog-now error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
