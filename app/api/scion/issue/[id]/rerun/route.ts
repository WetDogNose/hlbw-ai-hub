// Pass 22 — rerun an Issue.
//
// POST /api/scion/issue/[id]/rerun
// Clones the named Issue as a brand-new row: new id, status=`pending`,
// blank GraphState, copies instruction/title/priority/agentCategory/metadata/
// threadId. The next heartbeat picks it up. Audit-logged.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";

export interface RerunResponse {
  ok: true;
  sourceIssueId: string;
  newIssueId: string;
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
    const source = await prisma.issue.findUnique({ where: { id } });
    if (!source) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const created = await prisma.issue.create({
      data: {
        title: source.title,
        instruction: source.instruction,
        status: "pending",
        priority: source.priority,
        agentCategory: source.agentCategory,
        metadata: source.metadata ?? {},
        threadId: source.threadId,
      },
      select: { id: true },
    });
    await recordAdminAction(user, "issue.rerun", {
      issueId: id,
      newIssueId: created.id,
    });
    const body: RerunResponse = {
      ok: true,
      sourceIssueId: id,
      newIssueId: created.id,
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "rerun failed";
    console.error("/api/scion/issue/[id]/rerun error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
