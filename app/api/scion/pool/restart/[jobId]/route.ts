// Pass 22 — poll pool-restart job status.
//
// GET /api/scion/pool/restart/[jobId]
// Returns the in-memory job record from `poolRestartJobs` keyed by jobId.
// 404 if the id is unknown (server may have restarted since the job was
// created — the operator should re-trigger the restart).

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { poolRestartJobs } from "../jobs";

export async function GET(
  _req: Request,
  context:
    | { params: Promise<{ jobId: string }> }
    | { params: { jobId: string } },
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const paramsMaybePromise = (context as { params: unknown }).params;
  const params =
    paramsMaybePromise instanceof Promise
      ? await paramsMaybePromise
      : (paramsMaybePromise as { jobId: string });
  const jobId = params.jobId;
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json(
      { error: "jobId required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const job = poolRestartJobs.get(jobId);
  if (!job) {
    return NextResponse.json(
      { error: "unknown jobId" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(job, {
    headers: { "Cache-Control": "no-store" },
  });
}
