// GET /api/scion/engine-health
//
// Returns the dispatcher mode wired to this deployment plus a coarse
// status. The SCION dashboard uses this to render an honest "engine"
// badge — replacing the previous binary (error/no-error) inference from
// `/api/scion/state`, which lied about "Offline" whenever the worker pool
// was simply deployed elsewhere.
//
// Response shape:
//   {
//     dispatcherMode: "docker" | "noop",
//     status: "online" | "remote" | "degraded",
//     message: string,
//   }
//
// Meaning:
//   - "online"   — dispatcher runs here; happy path.
//   - "remote"   — dispatcher mode is `noop`; data plane lives on another
//                  host (e.g. Cloud Run UI + VM/Cloud Run Job data plane).
//   - "degraded" — dispatcher is configured but a downstream precondition
//                  (DB reachability) has failed. Reserved for future
//                  enhancement; today we return 200 + "online" when the DB
//                  round-trip below succeeds, and 503 + "degraded" when it
//                  does not.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getDispatcher } from "@/lib/orchestration/dispatchers";
import { getRuntimeConfig } from "@/lib/orchestration/runtime-config";

export interface EngineHealthResponse {
  dispatcherMode: "docker" | "noop" | "cloud-run-job";
  status: "online" | "remote" | "degraded" | "paused";
  message: string;
  dispatchPaused: boolean;
}

export async function GET() {
  const dispatcher = getDispatcher();

  // Read dispatch_paused runtime flag; errors fall through as `false`.
  let dispatchPaused = false;
  try {
    const eff = await getRuntimeConfig(
      "dispatch_paused",
      "SCION_DISPATCH_PAUSED",
      false,
    );
    dispatchPaused = eff.value === true;
  } catch {
    // swallow — runtime-config failures shouldn't cascade into health check
  }

  if (dispatcher.mode === "noop") {
    return NextResponse.json<EngineHealthResponse>({
      dispatcherMode: "noop",
      status: "remote",
      message:
        "Operator UI only — worker data plane runs in a separate deployment.",
      dispatchPaused,
    });
  }

  // Real dispatcher mode (docker or cloud-run-job). Probe the DB so the badge
  // reflects the caller's actual ability to claim work, not just that the Next
  // process is up. Cheap `SELECT 1` round-trip.
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (dispatchPaused) {
      return NextResponse.json<EngineHealthResponse>({
        dispatcherMode: dispatcher.mode,
        status: "paused",
        message: "Dispatch paused by operator — no new Issues will be claimed.",
        dispatchPaused: true,
      });
    }
    const readyMessage =
      dispatcher.mode === "cloud-run-job"
        ? "Cloud Run Job dispatcher ready."
        : "Local Docker dispatcher ready.";
    return NextResponse.json<EngineHealthResponse>({
      dispatcherMode: dispatcher.mode,
      status: "online",
      message: readyMessage,
      dispatchPaused: false,
    });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json<EngineHealthResponse>(
      {
        dispatcherMode: dispatcher.mode,
        status: "degraded",
        message: `Database unreachable: ${detail}`,
        dispatchPaused,
      },
      { status: 503 },
    );
  }
}
