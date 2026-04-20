// Pass 6 — Heartbeat-driven dispatch.
//
// POST body (optional): { limit?: number }        // default 5
// Response: {
//   staleReclaimed: number,
//   dispatched: DispatchResult[],
//   elapsedMs: number,
//   unauthenticated?: true,                       // dev mode, no secret set
// }
//
// Auth: header `x-orchestrator-secret` compared against
// `process.env.ORCHESTRATOR_SHARED_SECRET`. If the env var is unset, the
// request is allowed through BUT the response is tagged `unauthenticated: true`
// so the SCION UI can flag the insecure mode in dev.

import { NextResponse } from "next/server";
import {
  dispatchReadyIssues,
  reclaimStaleWorkers,
  type DispatchResult,
} from "@/lib/orchestration/dispatcher";

const AUTH_HEADER = "x-orchestrator-secret";

export async function POST(req: Request) {
  const startedAt = Date.now();

  // --- Auth gate ---
  const expected = process.env.ORCHESTRATOR_SHARED_SECRET;
  const provided = req.headers.get(AUTH_HEADER);

  let unauthenticated: boolean | undefined;
  if (!expected) {
    console.warn(
      "[orchestrator.heartbeat] ORCHESTRATOR_SHARED_SECRET unset — request allowed in insecure dev mode.",
    );
    unauthenticated = true;
  } else if (provided !== expected) {
    return NextResponse.json(
      { error: "Unauthorized heartbeat call." },
      { status: 401 },
    );
  }

  // --- Parse limit ---
  let limit = 5;
  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: unknown };
    if (typeof body.limit === "number" && body.limit > 0) {
      limit = Math.floor(body.limit);
    }
  } catch {
    // Keep default; body parsing errors don't fail the heartbeat.
  }

  // --- Reclaim stale workers ---
  let staleReclaimed: number;
  try {
    staleReclaimed = await reclaimStaleWorkers();
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "reclaimStaleWorkers failed";
    return NextResponse.json(
      {
        error: "Database error during reclaimStaleWorkers.",
        detail: message,
      },
      { status: 500 },
    );
  }

  // --- Dispatch ready issues ---
  let dispatched: DispatchResult[];
  try {
    dispatched = await dispatchReadyIssues(limit);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "dispatchReadyIssues failed";
    return NextResponse.json(
      {
        error: "Database error during dispatchReadyIssues.",
        detail: message,
        staleReclaimed,
      },
      { status: 500 },
    );
  }

  const elapsedMs = Date.now() - startedAt;
  return NextResponse.json({
    staleReclaimed,
    dispatched,
    elapsedMs,
    ...(unauthenticated ? { unauthenticated: true } : {}),
  });
}
