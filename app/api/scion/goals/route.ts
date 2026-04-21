// SCION goals collection endpoint.
//
// GET /api/scion/goals
//   Lists all Goal rows with aggregate issue counts (total, completed,
//   in_progress). Open to any authenticated SCION viewer — same read
//   contract as /api/scion/state.
//
// POST /api/scion/goals
//   Admin-only. Body: { description: string }. Creates a Goal rooted on the
//   singleton `__system` Organization (shared with the swarm's system-owned
//   AgentPersona — see `ensureSystemOrg()` in lib/orchestration/budget.ts).
//   Audit-logged.
//
// Response types are exported so the SCION UI can consume them without
// duplicating shapes.
//
// NOTE: there is no Prisma migration here — the `Goal` model already exists
// in schema.prisma.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import { ensureSystemOrg } from "@/lib/orchestration/budget";

export interface ScionGoalRow {
  id: string;
  description: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  issueCounts: {
    total: number;
    completed: number;
    in_progress: number;
  };
}

export interface ScionGoalsResponse {
  goals: ScionGoalRow[];
}

export interface ScionGoalCreateResponse {
  goal: ScionGoalRow;
}

export async function GET(): Promise<NextResponse> {
  try {
    const rows = await prisma.goal.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        issues: {
          select: { status: true },
        },
      },
    });
    const goals: ScionGoalRow[] = rows.map((g) => {
      const total = g.issues.length;
      let completed = 0;
      let inProgress = 0;
      for (const i of g.issues) {
        if (i.status === "completed") completed += 1;
        else if (i.status === "in_progress") inProgress += 1;
      }
      return {
        id: g.id,
        description: g.description,
        organizationId: g.organizationId,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
        issueCounts: {
          total,
          completed,
          in_progress: inProgress,
        },
      };
    });
    const body: ScionGoalsResponse = { goals };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "goals list failed";
    console.error("/api/scion/goals GET error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

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
    const organizationId = await ensureSystemOrg();
    const created = await prisma.goal.create({
      data: { description, organizationId },
    });
    await recordAdminAction(user, "goal.create", {
      goalId: created.id,
      description,
    });
    const goal: ScionGoalRow = {
      id: created.id,
      description: created.description,
      organizationId: created.organizationId,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      issueCounts: { total: 0, completed: 0, in_progress: 0 },
    };
    const response: ScionGoalCreateResponse = { goal };
    return NextResponse.json(response, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "goal create failed";
    console.error("/api/scion/goals POST error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
