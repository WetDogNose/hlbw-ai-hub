// Pass 24 — POST /api/scion/workflow/[id]/force-transition
//
// Admin-only debug override. Body: { nextNode: string; reason: string }.
// Validates `nextNode` against `GRAPH_TOPOLOGY.nodes`, then atomically:
//   - acquires FOR UPDATE on the task_graph_state row
//   - appends an `interrupt` HistoryEntry recording `forced→${nextNode}:${reason}`
//   - updates currentNode = nextNode, status = "running", interruptReason = null
// Then re-calls `StateGraph.resume` semantics on the row (noop if already
// running). Any exception path is wrapped and emits a structured 500 with an
// audit row recording the failure.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import { GRAPH_TOPOLOGY } from "@/lib/orchestration/introspection";
import type { HistoryEntry } from "@/lib/orchestration/graph";

export interface ForceTransitionRequest {
  nextNode: string;
  reason: string;
}

export interface ForceTransitionResponse {
  ok: true;
  issueId: string;
  from: string;
  to: string;
  reason: string;
}

const MAX_REASON_CHARS = 512;

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

  let body: { nextNode?: unknown; reason?: unknown };
  try {
    body =
      ((await req.json().catch(() => null)) as {
        nextNode?: unknown;
        reason?: unknown;
      } | null) ?? {};
  } catch {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const nextNode = body.nextNode;
  const reasonRaw = body.reason;
  if (typeof nextNode !== "string" || nextNode.length === 0) {
    return NextResponse.json(
      { error: "nextNode string required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!GRAPH_TOPOLOGY.nodes.includes(nextNode)) {
    return NextResponse.json(
      {
        error: `unknown node "${nextNode}"; must be one of ${GRAPH_TOPOLOGY.nodes.join(",")}`,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (typeof reasonRaw !== "string" || reasonRaw.trim().length === 0) {
    return NextResponse.json(
      { error: "reason string required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const reason = reasonRaw.trim().slice(0, MAX_REASON_CHARS);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Acquire FOR UPDATE lock on the row so concurrent transitions block.
      const rows = await tx.$queryRaw<
        Array<{
          issueId: string;
          currentNode: string;
          status: string;
          history: unknown;
        }>
      >(Prisma.sql`
        SELECT "issueId", "currentNode", "status", "history"
        FROM "task_graph_state"
        WHERE "issueId" = ${id}
        FOR UPDATE
      `);
      if (rows.length === 0) {
        throw new Error(`no task_graph_state row for issueId=${id}`);
      }
      const row = rows[0];
      const fromNode = row.currentNode;

      const nowIso = new Date().toISOString();
      const historyList: HistoryEntry[] = Array.isArray(row.history)
        ? (row.history as unknown as HistoryEntry[])
        : [];
      const entry: HistoryEntry = {
        node: fromNode,
        enteredAt: nowIso,
        exitedAt: nowIso,
        outcome: "interrupt",
        detail: `forced→${nextNode}:${reason}`,
      };
      const nextHistory = [...historyList, entry];

      const updated = await tx.taskGraphState.update({
        where: { issueId: id },
        data: {
          currentNode: nextNode,
          status: "running",
          interruptReason: null,
          history: nextHistory as unknown as Prisma.InputJsonValue,
          lastTransitionAt: new Date(),
        },
      });
      return { from: fromNode, stateAfter: updated };
    });

    await recordAdminAction(user, "workflow.force-transition", {
      issueId: id,
      from: result.from,
      to: nextNode,
      reason,
    });

    const response: ForceTransitionResponse = {
      ok: true,
      issueId: id,
      from: result.from,
      to: nextNode,
      reason,
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "force-transition failed";
    console.error("/api/scion/workflow/[id]/force-transition error:", err);
    // Audit the failure so the memory browser carries a record of why
    // the override didn't land.
    try {
      await recordAdminAction(user, "workflow.force-transition.failed", {
        issueId: id,
        nextNode,
        reason,
        error: message,
      });
    } catch {
      /* audit helper never throws, but defensive */
    }
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
