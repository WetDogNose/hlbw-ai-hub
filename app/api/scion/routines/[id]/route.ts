// SCION per-routine endpoint.
//
// GET    /api/scion/routines/[id]
//   Returns the routine row. 404 when not found.
//
// PATCH  /api/scion/routines/[id]
//   Admin-only. Body may include any of: cronExpression (validated),
//   taskPayload (string | object, validated for { agentName, instruction }),
//   isActive (boolean). Partial update; any field absent from the body is
//   left as-is. Audit-logged.
//
// DELETE /api/scion/routines/[id]
//   Admin-only. Audit-logged.

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import {
  isValidCronExpression,
  parseTaskPayload,
  type ScionRoutineRow,
} from "../route";

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

function toRow(r: {
  id: string;
  cronExpression: string;
  taskPayload: string;
  isActive: boolean;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ScionRoutineRow {
  return {
    id: r.id,
    cronExpression: r.cronExpression,
    taskPayload: r.taskPayload,
    isActive: r.isActive,
    lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function GET(
  _req: Request,
  context: ParamsCtx,
): Promise<NextResponse> {
  const id = await resolveId(context);
  if (!id) {
    return NextResponse.json(
      { error: "routine id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const routine = await prisma.routine.findUnique({ where: { id } });
    if (!routine) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(toRow(routine), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "routine fetch failed";
    console.error("/api/scion/routines/[id] GET error:", err);
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
      { error: "routine id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: Record<string, unknown> | null;
  try {
    body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
  } catch {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const patch: {
    cronExpression?: string;
    taskPayload?: string;
    isActive?: boolean;
  } = {};

  if ("cronExpression" in body) {
    const v = body.cronExpression;
    if (typeof v !== "string" || !isValidCronExpression(v.trim())) {
      return NextResponse.json(
        {
          error:
            "cronExpression must be 5 space-separated fields (minute hour dom month dow)",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    patch.cronExpression = v.trim();
  }

  if ("taskPayload" in body) {
    const parsed = parseTaskPayload(body.taskPayload);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "taskPayload must be JSON with at least { agentName, instruction } as non-empty strings",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    patch.taskPayload = JSON.stringify(parsed);
  }

  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json(
        { error: "isActive must be a boolean" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    patch.isActive = body.isActive;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "no editable fields supplied" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const existing = await prisma.routine.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const data: Prisma.RoutineUpdateInput = {};
    if (patch.cronExpression !== undefined)
      data.cronExpression = patch.cronExpression;
    if (patch.taskPayload !== undefined) data.taskPayload = patch.taskPayload;
    if (patch.isActive !== undefined) data.isActive = patch.isActive;

    const updated = await prisma.routine.update({ where: { id }, data });
    await recordAdminAction(user, "routine.patch", {
      routineId: id,
      patch,
    });
    return NextResponse.json(
      { ok: true, routine: toRow(updated) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "routine patch failed";
    console.error("/api/scion/routines/[id] PATCH error:", err);
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
      { error: "routine id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const existing = await prisma.routine.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    await prisma.routine.delete({ where: { id } });
    await recordAdminAction(user, "routine.delete", {
      routineId: id,
      cronExpression: existing.cronExpression,
    });
    return NextResponse.json(
      { ok: true, routineId: id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "routine delete failed";
    console.error("/api/scion/routines/[id] DELETE error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
