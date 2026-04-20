// Pass 18 — SCION recent-trace-summaries endpoint.
// Pass 23 — adds optional filters: status, category, from, to.
//
// GET /api/scion/traces?issueId=<id>&limit=<n>&status=<s>&category=<c>&from=<iso>&to=<iso>
//   - `issueId` (optional): filter to one task's recent runs (delegated to
//     the summaries fetcher).
//   - `limit` (optional, default 10, max 50): number of summaries to return.
//   - `status` (optional): filter rows where `TaskGraphState.status` maps to
//     this `TraceSummary.status` (ok|error|interrupted).
//   - `category` (optional): filter rows whose Issue.agentCategory matches.
//   - `from`, `to` (optional ISO8601): filter by `TaskGraphState.updatedAt`.
//
// Preserves the original behaviour when filters absent. All filters are
// applied server-side: we fetch a wide page from the summaries source and
// narrow post-hoc, then enrich with Issue.agentCategory via a single extra
// query. Caps the fetch at MAX_LIMIT so an unfiltered call never explodes.
//
// Response: `{ traces: TraceSummary[] }`.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
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

const ALLOWED_STATUSES: ReadonlyArray<TraceSummary["status"]> = [
  "ok",
  "error",
  "interrupted",
];

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const issueId = url.searchParams.get("issueId");
  const limitRaw = url.searchParams.get("limit");
  const statusRaw = url.searchParams.get("status");
  const categoryRaw = url.searchParams.get("category");
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));

  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const hasFilter = Boolean(statusRaw || categoryRaw || from || to);
  // Over-fetch when filtering so we can still return `limit` rows afterwards.
  const fetchLimit = hasFilter ? MAX_LIMIT : limit;

  try {
    const summaries = await fetchRecentTraceSummaries({
      ...(issueId ? { taskId: issueId } : {}),
      limit: fetchLimit,
    });

    let filtered = summaries;

    if (statusRaw) {
      if (!(ALLOWED_STATUSES as ReadonlyArray<string>).includes(statusRaw)) {
        return NextResponse.json(
          { error: "status must be one of ok|error|interrupted" },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      filtered = filtered.filter((s) => s.status === statusRaw);
    }

    if (from) {
      filtered = filtered.filter((s) => new Date(s.startedAt) >= from);
    }
    if (to) {
      filtered = filtered.filter((s) => new Date(s.startedAt) < to);
    }

    if (categoryRaw) {
      // Pull Issue.agentCategory for the candidate task ids in a single query.
      const ids = filtered.map((s) => s.taskId);
      if (ids.length > 0) {
        const issues = await prisma.issue.findMany({
          where: { id: { in: ids } },
          select: { id: true, agentCategory: true },
        });
        const catMap = new Map<string, string | null>();
        for (const i of issues) catMap.set(i.id, i.agentCategory);
        filtered = filtered.filter((s) => catMap.get(s.taskId) === categoryRaw);
      }
    }

    const body: ScionTracesResponse = { traces: filtered.slice(0, limit) };
    return NextResponse.json(body);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/traces error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
