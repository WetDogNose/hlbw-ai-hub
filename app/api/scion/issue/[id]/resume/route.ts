// Pass 22 — resume a paused/interrupted Issue.
//
// POST /api/scion/issue/[id]/resume
// Calls `StateGraph.resume(issueId)` to flip the row from `interrupted` or
// `paused` back to `running`, then spawns a fresh worker so the node loop
// picks up from the last persisted node. Audit-logged.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { defineGraph, type StateGraph } from "@/lib/orchestration/graph";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import { spawnWorkerSubprocess } from "@/lib/orchestration/dispatcher";

/**
 * Trivial StateGraph instance used solely for `.resume()`. Mirrors the
 * pattern in `scripts/swarm/watchdog.ts::getInterruptGraph` — the resume
 * transaction never dispatches a node, it only flips the row's status.
 */
function getResumeGraph(): StateGraph {
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
  _req: Request,
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

  try {
    const issue = await prisma.issue.findUnique({
      where: { id },
      include: { graphState: true },
    });
    if (!issue) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!issue.graphState) {
      return NextResponse.json(
        { error: "no graph state to resume" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const graph = getResumeGraph();
    const resumed = await graph.resume(id);
    // Put the parent Issue back into `in_progress` so the dispatcher skips it
    // and our explicit worker is the only runner. `startedAt` gets stamped so
    // the watchdog has a fresh reference point.
    await prisma.issue.update({
      where: { id },
      data: { status: "in_progress", startedAt: new Date() },
    });
    const branchName = `issue/${id}`;
    const agentCategory = issue.agentCategory ?? "default";
    const { workerId } = await spawnWorkerSubprocess(
      id,
      issue.instruction,
      branchName,
      agentCategory,
    );
    await recordAdminAction(user, "issue.resume", {
      issueId: id,
      fromStatus: issue.graphState.status,
      toStatus: resumed.status,
      workerId,
    });
    return NextResponse.json(
      {
        ok: true,
        issueId: id,
        graphStatus: resumed.status,
        workerId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "resume failed";
    console.error("/api/scion/issue/[id]/resume error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
