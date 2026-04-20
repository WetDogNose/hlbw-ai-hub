// Pass 23 — DELETE /api/scion/memory/[id]
//
// Admin-only. Deletes one `MemoryEpisode` row. Audited. Returns 404 if the
// row is missing.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";

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
      { error: "memory id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const existing = await prisma.memoryEpisode.findUnique({
      where: { id },
      select: { id: true, kind: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    await prisma.memoryEpisode.delete({ where: { id } });
    await recordAdminAction(user, "memory.delete", {
      memoryId: id,
      kind: existing.kind,
    });
    return NextResponse.json(
      { ok: true, id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "delete failed";
    console.error("/api/scion/memory/[id] error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
