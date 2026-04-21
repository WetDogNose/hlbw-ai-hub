// Pass 16 — SCION issue detail endpoint (GET).
// Pass 22 — adds PATCH for admin-gated priority/agentCategory/metadata edits.
//
// GET /api/scion/issue/[id]
// Returns the single Issue with its graphState and a `recentHistory` slice
// (last 25 HistoryEntry records from `TaskGraphState.history`). 404 when
// the issue is not found. When `?includeMemory=true`, also includes the most
// recent `MemoryEpisode kind:"decision"` rows tagged with this issue's id
// (audit trail + last critic decisions).
//
// PATCH /api/scion/issue/[id]
// Body: { priority?: number; agentCategory?: string | null; metadata?: object }
// Admin-only. Status, dependencies, blockedBy, threadId stay system-managed.
// Audit-logged.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { HistoryEntry } from "@/lib/orchestration/graph/types";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";

export interface IssueMemoryRow {
  id: string;
  createdAt: string;
  summary: string;
  content: unknown;
  kind?: string;
}

export interface IssueDetailResponse {
  id: string;
  title: string | null;
  instruction: string;
  status: string;
  priority: number;
  dependencies: string[];
  blockedBy: string[];
  agentCategory: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  threadId: string;
  metadata: unknown;
  graphState: {
    currentNode: string;
    status: string;
    interruptReason: string | null;
    lastTransitionAt: string;
    context: unknown;
  } | null;
  recentHistory: HistoryEntry[];
  historyTotal: number;
  recentDecisions?: IssueMemoryRow[];
}

const HISTORY_LIMIT = 25;
const HISTORY_LIMIT_MAX = 500;
const DECISION_LIMIT = 25;
const MEMORY_LIMIT_MAX = 200;
const VALID_MEMORY_KINDS = new Set([
  "task_context",
  "discovery",
  "decision",
  "entity",
  "observation",
  "relation",
]);

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } },
): Promise<NextResponse> {
  const paramsMaybePromise = (context as { params: unknown }).params;
  const params =
    paramsMaybePromise instanceof Promise
      ? await paramsMaybePromise
      : (paramsMaybePromise as { id: string });
  const id = params.id;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "issue id required" }, { status: 400 });
  }

  const url = new URL(req.url);
  const includeMemory = url.searchParams.get("includeMemory") === "true";
  const memoryKindsRaw = url.searchParams.get("memoryKinds");
  const memoryLimitRaw = url.searchParams.get("memoryLimit");
  const historyOffsetRaw = url.searchParams.get("historyOffset");
  const historyLimitRaw = url.searchParams.get("historyLimit");

  const memoryKinds = (() => {
    if (!memoryKindsRaw) return ["decision"];
    return memoryKindsRaw
      .split(",")
      .map((k) => k.trim())
      .filter((k) => VALID_MEMORY_KINDS.has(k));
  })();
  const memoryLimit = Math.min(
    Math.max(1, Number.parseInt(memoryLimitRaw ?? "", 10) || DECISION_LIMIT),
    MEMORY_LIMIT_MAX,
  );
  const historyOffset = Math.max(
    0,
    Number.parseInt(historyOffsetRaw ?? "0", 10) || 0,
  );
  const historyLimit = Math.min(
    Math.max(1, Number.parseInt(historyLimitRaw ?? "", 10) || HISTORY_LIMIT),
    HISTORY_LIMIT_MAX,
  );

  try {
    const issue = await prisma.issue.findUnique({
      where: { id },
      include: { graphState: true },
    });
    if (!issue) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    let recentHistory: HistoryEntry[] = [];
    let historyTotal = 0;
    if (issue.graphState && Array.isArray(issue.graphState.history)) {
      const arr = issue.graphState.history as unknown as HistoryEntry[];
      historyTotal = arr.length;
      // Return the most recent N entries, skipping `historyOffset` from the end.
      const endExclusive = Math.max(0, arr.length - historyOffset);
      const startInclusive = Math.max(0, endExclusive - historyLimit);
      recentHistory = arr.slice(startInclusive, endExclusive);
    }

    let recentDecisions: IssueMemoryRow[] | undefined;
    if (includeMemory && memoryKinds.length > 0) {
      const rows = await prisma.memoryEpisode.findMany({
        where: { taskId: id, kind: { in: memoryKinds } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: memoryLimit,
        select: {
          id: true,
          createdAt: true,
          summary: true,
          content: true,
          kind: true,
        },
      });
      recentDecisions = rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        summary: r.summary,
        content: r.content,
        kind: r.kind,
      }));
    }

    const response: IssueDetailResponse = {
      id: issue.id,
      title: issue.title,
      instruction: issue.instruction,
      status: issue.status,
      priority: issue.priority,
      dependencies: issue.dependencies,
      blockedBy: issue.blockedBy,
      agentCategory: issue.agentCategory,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
      startedAt: issue.startedAt ? issue.startedAt.toISOString() : null,
      completedAt: issue.completedAt ? issue.completedAt.toISOString() : null,
      threadId: issue.threadId,
      metadata: issue.metadata,
      graphState: issue.graphState
        ? {
            currentNode: issue.graphState.currentNode,
            status: issue.graphState.status,
            interruptReason: issue.graphState.interruptReason,
            lastTransitionAt: issue.graphState.lastTransitionAt.toISOString(),
            context: issue.graphState.context,
          }
        : null,
      recentHistory,
      historyTotal,
      ...(recentDecisions ? { recentDecisions } : {}),
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/issue/[id] error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
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

  let patch: {
    priority?: number;
    agentCategory?: string | null;
    metadata?: Record<string, unknown>;
  };
  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "invalid body" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    patch = {};
    if ("priority" in body) {
      const v = body.priority;
      if (typeof v !== "number" || !Number.isFinite(v)) {
        return NextResponse.json(
          { error: "priority must be a number" },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      patch.priority = Math.floor(v);
    }
    if ("agentCategory" in body) {
      const v = body.agentCategory;
      if (v !== null && typeof v !== "string") {
        return NextResponse.json(
          { error: "agentCategory must be string or null" },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      patch.agentCategory = v as string | null;
    }
    if ("metadata" in body) {
      const v = body.metadata;
      if (v === null || typeof v !== "object" || Array.isArray(v)) {
        return NextResponse.json(
          { error: "metadata must be a JSON object" },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      patch.metadata = v as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "no editable fields supplied" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const data: Prisma.IssueUpdateInput = {};
    if (patch.priority !== undefined) data.priority = patch.priority;
    if (patch.agentCategory !== undefined)
      data.agentCategory = patch.agentCategory;
    if (patch.metadata !== undefined)
      data.metadata = patch.metadata as Prisma.InputJsonValue;
    const updated = await prisma.issue.update({
      where: { id },
      data,
      select: {
        id: true,
        priority: true,
        agentCategory: true,
        metadata: true,
      },
    });
    await recordAdminAction(user, "issue.patch", {
      issueId: id,
      patch,
    });
    return NextResponse.json(
      { ok: true, issue: updated },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "patch failed";
    console.error("/api/scion/issue/[id] PATCH error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
