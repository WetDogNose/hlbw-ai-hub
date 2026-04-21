// SCION agent-personas list + create endpoint.
//
// GET  /api/scion/personas
//   Returns every `AgentPersona` row (excluding the internal `__system`
//   singleton used by budget.ts) with aggregate counts:
//     - `assignedIssues`: # of Issues referencing `assignedAgentId`.
//     - `tokensSpent`:    sum of `BudgetLedger.tokensUsed` across that agent.
//     - `openIssues`:     # of non-terminal Issues (pending / in_progress /
//                         blocked / needs_human).
//
// POST /api/scion/personas  — admin-only, audited.
//   Body: { name: string, role: string }.
//   Auto-resolves the `organizationId` by upserting the `__system`
//   organization (same SYSTEM_ORG_NAME pattern used in
//   `lib/orchestration/budget.ts`). Callers cannot reassign personas to an
//   arbitrary organization — that is out-of-scope for the SCION dashboard and
//   would open multi-tenant routing questions the runtime does not address.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import { SYSTEM_AGENT_NAME, SYSTEM_ORG_NAME } from "@/lib/orchestration/budget";

export interface PersonaListRow {
  id: string;
  name: string;
  role: string;
  status: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  assignedIssues: number;
  openIssues: number;
  tokensSpent: number;
}

export interface PersonaListResponse {
  personas: PersonaListRow[];
}

const OPEN_STATUSES = new Set([
  "pending",
  "in_progress",
  "blocked",
  "needs_human",
]);

export async function GET(): Promise<NextResponse> {
  try {
    const personas = await prisma.agentPersona.findMany({
      where: { name: { not: SYSTEM_AGENT_NAME } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        name: true,
        role: true,
        status: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
        issues: {
          select: { status: true },
        },
        ledgers: {
          select: { tokensUsed: true },
        },
      },
    });
    const rows: PersonaListRow[] = personas.map((p) => {
      const tokensSpent = p.ledgers.reduce(
        (sum, l) => sum + (l.tokensUsed ?? 0),
        0,
      );
      const assignedIssues = p.issues.length;
      const openIssues = p.issues.filter((i) =>
        OPEN_STATUSES.has(i.status),
      ).length;
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        status: p.status,
        organizationId: p.organizationId,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        assignedIssues,
        openIssues,
        tokensSpent,
      };
    });
    const response: PersonaListResponse = { personas: rows };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/personas GET error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

async function resolveSystemOrganizationId(): Promise<string> {
  const existing = await prisma.organization.findFirst({
    where: { name: SYSTEM_ORG_NAME },
  });
  if (existing) return existing.id;
  const created = await prisma.organization.create({
    data: { name: SYSTEM_ORG_NAME },
  });
  return created.id;
}

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  let body: { name?: unknown; role?: unknown };
  try {
    body =
      ((await req.json().catch(() => null)) as {
        name?: unknown;
        role?: unknown;
      } | null) ?? {};
  } catch {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!role) {
    return NextResponse.json(
      { error: "role is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (name === SYSTEM_AGENT_NAME) {
    return NextResponse.json(
      { error: "name is reserved" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const organizationId = await resolveSystemOrganizationId();
    const created = await prisma.agentPersona.create({
      data: {
        name,
        role,
        organizationId,
      },
      select: {
        id: true,
        name: true,
        role: true,
        status: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await recordAdminAction(user, "persona.create", {
      personaId: created.id,
      name,
      role,
    });
    return NextResponse.json(
      {
        ok: true,
        persona: {
          ...created,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/personas POST error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
