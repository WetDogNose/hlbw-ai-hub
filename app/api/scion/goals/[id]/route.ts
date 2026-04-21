// SCION per-goal endpoint.
//
// GET /api/scion/goals/[id]
//   Returns a single goal with a summary of its linked issues
//   (id / title / status / priority). 404 when not found.
//
// PATCH /api/scion/goals/[id]
//   Admin-only. Body: { description: string }. Updates the description.
//   Audit-logged.
//
// DELETE /api/scion/goals/[id]
//   Admin-only. Refuses with 409 when issues are still linked (we never
//   cascade-delete live work). Audit-logged.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";

export interface ScionGoalIssueSummary {
  id: string;
  title: string | null;
  status: string;
  priority: number;
  createdAt: string;
}

export interface ScionGoalDetailResponse {
  id: string;
  description: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  issues: ScionGoalIssueSummary[];
}

type ParamsCtx =
  | { params: Promise<{ id: string }> }
  | { params: { id: string } };

async function resolveId(context: ParamsCtx): Promise<string | null> {
  const paramsMaybePromise = (context as { params: unknown }).params;
  const params =
    paramsMaybePromise instanceof Promise
      ? await paramsMaybePromise
      : (paramsMaybePromise as { id: string });
  const id = params?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export async function GET(
  _req: Request,
  context: ParamsCtx,
): Promise<NextResponse> {
  const id = await resolveId(context);
  if (!id) {
    return NextResponse.json(
      { error: "goal id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const goal = await prisma.goal.findUnique({
      where: { id },
      include: {
        issues: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
          },
        },
      },
    });
    if (!goal) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const response: ScionGoalDetailResponse = {
      id: goal.id,
      description: goal.description,
      organizationId: goal.organizationId,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
      issues: goal.issues.map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        priority: i.priority,
        createdAt: i.createdAt.toISOString(),
      })),
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "goal fetch failed";
    console.error("/api/scion/goals/[id] GET error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PATCH(
  req: Request,
  context: ParamsCtx,
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  const id = await resolveId(context);
  if (!id) {
    return NextResponse.json(
      { error: "goal id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: { description?: unknown };
  try {
    body = (await req.json()) as { description?: unknown };
  } catch {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  if (description.length === 0) {
    return NextResponse.json(
      { error: "description is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const existing = await prisma.goal.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const updated = await prisma.goal.update({
      where: { id },
      data: { description },
    });
    await recordAdminAction(user, "goal.patch", {
      goalId: id,
      previousDescription: existing.description,
      description,
    });
    return NextResponse.json(
      {
        ok: true,
        goal: {
          id: updated.id,
          description: updated.description,
          organizationId: updated.organizationId,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "goal patch failed";
    console.error("/api/scion/goals/[id] PATCH error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE(
  _req: Request,
  context: ParamsCtx,
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  const id = await resolveId(context);
  if (!id) {
    return NextResponse.json(
      { error: "goal id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const existing = await prisma.goal.findUnique({
      where: { id },
      include: { _count: { select: { issues: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const linkedIssues = existing._count.issues;
    if (linkedIssues > 0) {
      return NextResponse.json(
        {
          error: `goal has ${linkedIssues} linked issue${linkedIssues === 1 ? "" : "s"}; unlink before deleting`,
          linkedIssues,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    await prisma.goal.delete({ where: { id } });
    await recordAdminAction(user, "goal.delete", {
      goalId: id,
      description: existing.description,
    });
    return NextResponse.json(
      { ok: true, goalId: id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "goal delete failed";
    console.error("/api/scion/goals/[id] DELETE error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
