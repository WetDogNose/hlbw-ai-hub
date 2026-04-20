// Pass 24 — GET /api/scion/code-index/seed/[jobId]
//
// Poll the in-memory job status written by the POST sibling. Admin-only.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { seedJobs } from "../jobs";

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
  const job = seedJobs.get(jobId);
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
