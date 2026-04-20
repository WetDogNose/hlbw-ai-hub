// Pass 22 — admin button that fires the heartbeat in-process.
//
// POST /api/scion/heartbeat-now
// Runs `reclaimStaleWorkers` + `dispatchReadyIssues` directly (bypassing the
// `ORCHESTRATOR_SHARED_SECRET` gate on `/api/orchestrator/heartbeat`) because
// the admin's IAP identity already gated the call. Returns the same shape as
// the underlying heartbeat route for UI-side parity.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import {
  dispatchReadyIssues,
  reclaimStaleWorkers,
  type DispatchResult,
} from "@/lib/orchestration/dispatcher";

export interface ScionHeartbeatNowResponse {
  staleReclaimed: number;
  dispatched: DispatchResult[];
  elapsedMs: number;
}

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  const startedAt = Date.now();

  // Parse optional { limit }. Invalid bodies default to 5.
  let limit = 5;
  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: unknown };
    if (typeof body.limit === "number" && body.limit > 0) {
      limit = Math.floor(body.limit);
    }
  } catch {
    // default
  }

  try {
    const staleReclaimed = await reclaimStaleWorkers();
    const dispatched = await dispatchReadyIssues(limit);
    const elapsedMs = Date.now() - startedAt;
    await recordAdminAction(user, "orchestrator.heartbeat_now", {
      limit,
      staleReclaimed,
      dispatchedCount: dispatched.length,
    });
    const body: ScionHeartbeatNowResponse = {
      staleReclaimed,
      dispatched,
      elapsedMs,
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "heartbeat-now failed";
    console.error("/api/scion/heartbeat-now error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
