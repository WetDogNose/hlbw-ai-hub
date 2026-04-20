// Pass 22 — force-interrupt a running Issue graph.
//
// POST /api/scion/issue/[id]/interrupt
// Body (optional): { reason?: string }
// Wraps `StateGraph.interrupt(issueId, reason)`. Requires a graphState row.
// Audit-logged.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { defineGraph, type StateGraph } from "@/lib/orchestration/graph";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";

function getInterruptGraph(): StateGraph {
  return defineGraph({
    startNode: "no_op",
    nodes: {
      no_op: {
        name: "no_op",
        async run() {
          return { kind: "complete" };
        },
      },
    },
  });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } },
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  const paramsMaybePromise = (context as { params: unknown }).params;
  const params =
    paramsMaybePromise instanceof Promise
      ? await paramsMaybePromise
      : (paramsMaybePromise as { id: string });
  const id = params.id;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { error: "issue id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let reason = "user_force_interrupt";
  try {
    const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
    if (typeof body.reason === "string" && body.reason.trim().length > 0) {
      reason = body.reason.trim().slice(0, 512);
    }
  } catch {
    // default reason
  }

  try {
    const graphState = await prisma.taskGraphState.findUnique({
      where: { issueId: id },
    });
    if (!graphState) {
      return NextResponse.json(
        { error: "no graph state for issue" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const graph = getInterruptGraph();
    const row = await graph.interrupt(id, reason);
    await recordAdminAction(user, "issue.interrupt", {
      issueId: id,
      reason,
      previousStatus: graphState.status,
    });
    return NextResponse.json(
      { ok: true, issueId: id, graphStatus: row.status, reason },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "interrupt failed";
    console.error("/api/scion/issue/[id]/interrupt error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
