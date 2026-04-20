// Pass 22 — resolve a needs_human Issue.
//
// POST /api/scion/issue/[id]/resolve
// Body: { note: string }
// Flips a `needs_human` Issue back to `pending`, storing the resolution note
// as a `MemoryEpisode kind:"decision"` (the audit helper does this for us).
// Rejects issues not currently in `needs_human`.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";

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

  let note = "";
  try {
    const body = (await req.json().catch(() => ({}))) as { note?: unknown };
    if (typeof body.note === "string") note = body.note.trim();
  } catch {
    // body is optional — default empty string
  }
  if (!note) {
    return NextResponse.json(
      { error: "note is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const issue = await prisma.issue.findUnique({ where: { id } });
    if (!issue) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (issue.status !== "needs_human") {
      return NextResponse.json(
        {
          error: `resolve requires status=needs_human (got ${issue.status})`,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    await prisma.issue.update({
      where: { id },
      data: { status: "pending", startedAt: null },
    });
    await recordAdminAction(user, "issue.resolve", {
      issueId: id,
      note,
    });
    return NextResponse.json(
      { ok: true, issueId: id, status: "pending" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "resolve failed";
    console.error("/api/scion/issue/[id]/resolve error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
