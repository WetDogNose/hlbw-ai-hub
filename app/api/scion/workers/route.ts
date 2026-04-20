// Pass 21 — SCION live workers endpoint.
//
// GET /api/scion/workers
// Returns `{ workers: LiveWorker[] }` — one row per running Docker container
// whose name matches the hlbw-worker pattern. Empty array when docker is
// absent (Cloud Run runtime) or returns no containers.

import { NextResponse } from "next/server";
import {
  listLiveWorkers,
  type LiveWorker,
} from "@/lib/orchestration/introspection";

export interface ScionWorkersResponse {
  workers: LiveWorker[];
}

export async function GET(): Promise<NextResponse> {
  try {
    const workers = await listLiveWorkers();
    const body: ScionWorkersResponse = { workers };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/workers error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
