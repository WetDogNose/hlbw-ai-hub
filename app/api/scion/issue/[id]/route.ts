// Pass 16 — SCION issue detail endpoint.
//
// GET /api/scion/issue/[id]
// Returns the single Issue with its graphState and a `recentHistory` slice
// (last 25 HistoryEntry records from `TaskGraphState.history`). 404 when
// the issue is not found.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { HistoryEntry } from "@/lib/orchestration/graph/types";

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
}

const HISTORY_LIMIT = 25;

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } },
) {
  const paramsMaybePromise = (context as { params: unknown }).params;
  const params =
    paramsMaybePromise instanceof Promise
      ? await paramsMaybePromise
      : (paramsMaybePromise as { id: string });
  const id = params.id;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "issue id required" }, { status: 400 });
  }

  try {
    const issue = await prisma.issue.findUnique({
      where: { id },
      include: { graphState: true },
    });
    if (!issue) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    let recentHistory: HistoryEntry[] = [];
    if (issue.graphState && Array.isArray(issue.graphState.history)) {
      const arr = issue.graphState.history as unknown as HistoryEntry[];
      recentHistory = arr.slice(-HISTORY_LIMIT);
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
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/issue/[id] error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
