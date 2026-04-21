// SCION thread detail + delete endpoint.
//
// GET /api/scion/threads/[id]
//   Returns thread metadata + all issues in it (status, priority, createdAt).
//
// DELETE /api/scion/threads/[id]
//   Admin-only. Returns 409 if the thread still has issues linked — never
//   cascades. Audited.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";

export interface ThreadIssueSummary {
  id: string;
  title: string | null;
  instruction: string;
  status: string;
  priority: number;
  createdAt: string;
}

export interface ThreadDetailResponse {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  issueCount: number;
  issues: ThreadIssueSummary[];
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } },
): Promise<NextResponse> {
  const paramsMaybePromise = (context as { params: unknown }).params;
  const params =
    paramsMaybePromise instanceof Promise
      ? await paramsMaybePromise
      : (paramsMaybePromise as { id: string });
  const id = params.id;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { error: "thread id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const thread = await prisma.thread.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        issues: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            title: true,
            instruction: true,
            status: true,
            priority: true,
            createdAt: true,
          },
        },
      },
    });
    if (!thread) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const body: ThreadDetailResponse = {
      id: thread.id,
      title: thread.title,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      issueCount: thread.issues.length,
      issues: thread.issues.map(
        (i): ThreadIssueSummary => ({
          id: i.id,
          title: i.title,
          instruction: i.instruction,
          status: i.status,
          priority: i.priority,
          createdAt: i.createdAt.toISOString(),
        }),
      ),
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/threads/[id] GET error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE(
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
      { error: "thread id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const thread = await prisma.thread.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        _count: { select: { issues: true } },
      },
    });
    if (!thread) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (thread._count.issues > 0) {
      return NextResponse.json(
        {
          error: `thread still has ${thread._count.issues} issue(s); detach or delete them first`,
          issueCount: thread._count.issues,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    await prisma.thread.delete({ where: { id } });
    await recordAdminAction(user, "thread.delete", {
      threadId: id,
      title: thread.title,
    });
    return NextResponse.json(
      { ok: true, id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "delete failed";
    console.error("/api/scion/threads/[id] DELETE error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
