// Pass 18 — SCION recent-trace-summaries endpoint.
//
// GET /api/scion/traces?issueId=<id>&limit=<n>
//   - `issueId` (optional): filter to one task's recent runs.
//   - `limit` (optional, default 10, max 50): how many summaries to return.
//
// Response: `{ traces: TraceSummary[] }`. Cached briefly via Next.js
// `revalidate` so the SCION UI can poll cheaply. UI wiring beyond this
// is out of scope for pass 18.

import { NextResponse } from "next/server";
import {
  fetchRecentTraceSummaries,
  type TraceSummary,
} from "@/lib/orchestration/tracing/summaries";

export const revalidate = 5;

export interface ScionTracesResponse {
  traces: TraceSummary[];
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const issueId = url.searchParams.get("issueId");
  const limitRaw = url.searchParams.get("limit");

  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  try {
    const traces = await fetchRecentTraceSummaries({
      ...(issueId ? { taskId: issueId } : {}),
      limit,
    });
    const body: ScionTracesResponse = { traces };
    return NextResponse.json(body);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/traces error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
