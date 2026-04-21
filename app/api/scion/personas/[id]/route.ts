// SCION agent-persona detail endpoint.
//
// GET    /api/scion/personas/[id]
//   Returns the persona plus a compact view of assigned Issues (last 25,
//   newest first) and the recent BudgetLedger rows (last 25). 404 if the
//   persona does not exist.
//
// PATCH  /api/scion/personas/[id]   — admin-only, audited.
//   Body: { role?: string, status?: "IDLE" | "RUNNING" | "PAUSED" }.
//   Name is intentionally immutable: it is a stable handle used by operator
//   UI and the budget ledger's `SYSTEM_AGENT_NAME` guard. Callers wanting a
//   rename today can recreate.
//
// DELETE /api/scion/personas/[id]   — admin-only, audited.
//   Returns 409 when the persona still has assigned Issues or ledger entries
//   — preserving the audit trail + foreign-key referential integrity. The
//   `__system` persona can never be deleted.

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import { SYSTEM_AGENT_NAME } from "@/lib/orchestration/budget";

const VALID_STATUSES = new Set(["IDLE", "RUNNING", "PAUSED"]);
const ASSIGNED_ISSUE_LIMIT = 25;
const RECENT_LEDGER_LIMIT = 25;

export interface PersonaAssignedIssue {
  id: string;
  title: string | null;
  status: string;
  priority: number;
  agentCategory: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaLedgerRow {
  id: string;
  tokensUsed: number;
  cost: number;
  issueId: string | null;
  createdAt: string;
}

export interface PersonaDetailResponse {
  id: string;
  name: string;
  role: string;
  status: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  assignedIssueCount: number;
  tokensSpent: number;
  assignedIssues: PersonaAssignedIssue[];
  recentLedger: PersonaLedgerRow[];
}

async function resolveParamId(
  context: { params: Promise<{ id: string }> } | { params: { id: string } },
): Promise<string | null> {
  const paramsMaybePromise = (context as { params: unknown }).params;
  const params =
    paramsMaybePromise instanceof Promise
      ? await paramsMaybePromise
      : (paramsMaybePromise as { id: string });
  const id = params.id;
  if (!id || typeof id !== "string") return null;
  return id;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } },
): Promise<NextResponse> {
  const id = await resolveParamId(context);
  if (!id) {
    return NextResponse.json(
      { error: "persona id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const persona = await prisma.agentPersona.findUnique({
      where: { id },
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
    if (!persona) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const [assignedIssues, recentLedger, ledgerTotal, issueCount] =
      await Promise.all([
        prisma.issue.findMany({
          where: { assignedAgentId: id },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: ASSIGNED_ISSUE_LIMIT,
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            agentCategory: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.budgetLedger.findMany({
          where: { agentId: id },
          orderBy: [{ timestamp: "desc" }, { id: "desc" }],
          take: RECENT_LEDGER_LIMIT,
          select: {
            id: true,
            tokensUsed: true,
            cost: true,
            issueId: true,
            timestamp: true,
          },
        }),
        prisma.budgetLedger.aggregate({
          where: { agentId: id },
          _sum: { tokensUsed: true },
        }),
        prisma.issue.count({ where: { assignedAgentId: id } }),
      ]);

    const response: PersonaDetailResponse = {
      id: persona.id,
      name: persona.name,
      role: persona.role,
      status: persona.status,
      organizationId: persona.organizationId,
      createdAt: persona.createdAt.toISOString(),
      updatedAt: persona.updatedAt.toISOString(),
      assignedIssueCount: issueCount,
      tokensSpent: ledgerTotal._sum.tokensUsed ?? 0,
      assignedIssues: assignedIssues.map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        priority: i.priority,
        agentCategory: i.agentCategory,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
      recentLedger: recentLedger.map((l) => ({
        id: l.id,
        tokensUsed: l.tokensUsed,
        cost: Number(l.cost),
        issueId: l.issueId,
        createdAt: l.timestamp.toISOString(),
      })),
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/personas/[id] GET error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } },
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  const id = await resolveParamId(context);
  if (!id) {
    return NextResponse.json(
      { error: "persona id required" },
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

  const patch: { role?: string; status?: string } = {};
  if ("role" in body) {
    const v = body.role;
    if (typeof v !== "string" || v.trim().length === 0) {
      return NextResponse.json(
        { error: "role must be a non-empty string" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    patch.role = v.trim();
  }
  if ("status" in body) {
    const v = body.status;
    if (typeof v !== "string" || !VALID_STATUSES.has(v)) {
      return NextResponse.json(
        { error: "status must be one of IDLE, RUNNING, PAUSED" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    patch.status = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "no editable fields supplied" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const existing = await prisma.agentPersona.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (existing.name === SYSTEM_AGENT_NAME) {
      return NextResponse.json(
        { error: "system persona is immutable" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const data: Prisma.AgentPersonaUpdateInput = {};
    if (patch.role !== undefined) data.role = patch.role;
    if (patch.status !== undefined) data.status = patch.status;

    const updated = await prisma.agentPersona.update({
      where: { id },
      data,
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
    await recordAdminAction(user, "persona.patch", {
      personaId: id,
      patch,
    });
    return NextResponse.json(
      {
        ok: true,
        persona: {
          ...updated,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "patch failed";
    console.error("/api/scion/personas/[id] PATCH error:", error);
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

  const id = await resolveParamId(context);
  if (!id) {
    return NextResponse.json(
      { error: "persona id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const existing = await prisma.agentPersona.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (existing.name === SYSTEM_AGENT_NAME) {
      return NextResponse.json(
        { error: "system persona cannot be deleted" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const [issueCount, ledgerCount] = await Promise.all([
      prisma.issue.count({ where: { assignedAgentId: id } }),
      prisma.budgetLedger.count({ where: { agentId: id } }),
    ]);
    if (issueCount > 0 || ledgerCount > 0) {
      return NextResponse.json(
        {
          error: "persona has linked records",
          issueCount,
          ledgerCount,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    await prisma.agentPersona.delete({ where: { id } });
    await recordAdminAction(user, "persona.delete", {
      personaId: id,
      name: existing.name,
    });
    return NextResponse.json(
      { ok: true, id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "delete failed";
    console.error("/api/scion/personas/[id] DELETE error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
