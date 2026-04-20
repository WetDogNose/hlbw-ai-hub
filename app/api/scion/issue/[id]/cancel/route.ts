// Pass 22 — cancel an Issue.
//
// POST /api/scion/issue/[id]/cancel
// Sets Issue.status = 'cancelled' + TaskGraphState.status = 'failed' with
// interruptReason = 'user_cancelled'. Audit-logged. No-op if the issue is
// already terminal (`completed`/`failed`/`cancelled`).

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";

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
    const terminal = ["completed", "failed", "cancelled"];
    if (terminal.includes(issue.status)) {
      return NextResponse.json(
        { error: `issue is terminal (${issue.status})` },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    await prisma.$transaction(async (tx) => {
      await tx.issue.update({
        where: { id },
        data: { status: "cancelled", completedAt: new Date() },
      });
      if (issue.graphState) {
        await tx.taskGraphState.update({
          where: { issueId: id },
          data: {
            status: "failed",
            interruptReason: "user_cancelled",
            lastTransitionAt: new Date(),
          },
        });
      }
    });
    await recordAdminAction(user, "issue.cancel", {
      issueId: id,
      previousStatus: issue.status,
    });
    return NextResponse.json(
      { ok: true, issueId: id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "cancel failed";
    console.error("/api/scion/issue/[id]/cancel error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
