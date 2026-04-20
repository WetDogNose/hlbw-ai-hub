// Pass 16 — SCION state read endpoint.
//
// GET /api/scion/state?limit=<n>&cursor=<issueId>
// Returns:
//   {
//     issues: IssueWithGraphState[],
//     ledgerTotal: number,                    // sum(BudgetLedger.tokensUsed)
//     workerCounts: {                         // from TaskGraphState.status
//       running, paused, interrupted, completed, failed
//     },
//     nextCursor: string | null,
//   }
//
// Pagination: keyset on `createdAt DESC, id DESC`. `cursor` is the last
// seen `issueId` from the previous page. Default `limit=50`, max 200.
// Auth/tenant scoping is deferred (pass 16 scope). All Issues visible.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// The exact `Prisma.TaskGraphStateGetPayload<object>` row shape — imported
// indirectly via the Prisma client. We keep the response shape loose to
// avoid dragging Prisma generics into API consumers.
export interface IssueWithGraphState {
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
  graphState: {
    currentNode: string;
    status: "running" | "paused" | "interrupted" | "completed" | "failed";
    interruptReason: string | null;
    lastTransitionAt: string;
  } | null;
}

export interface ScionStateResponse {
  issues: IssueWithGraphState[];
  ledgerTotal: number;
  workerCounts: {
    running: number;
    paused: number;
    interrupted: number;
    completed: number;
    failed: number;
  };
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor");

  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  try {
    const issues = await prisma.issue.findMany({
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        graphState: {
          select: {
            currentNode: true,
            status: true,
            interruptReason: true,
            lastTransitionAt: true,
          },
        },
      },
    });

    const hasMore = issues.length > limit;
    const page = hasMore ? issues.slice(0, limit) : issues;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const [ledgerAgg, graphGroups] = await Promise.all([
      prisma.budgetLedger.aggregate({ _sum: { tokensUsed: true } }),
      prisma.taskGraphState.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    const workerCounts = {
      running: 0,
      paused: 0,
      interrupted: 0,
      completed: 0,
      failed: 0,
    };
    for (const row of graphGroups) {
      const key = row.status as keyof typeof workerCounts;
      if (key in workerCounts) {
        workerCounts[key] = row._count._all;
      }
    }

    const response: ScionStateResponse = {
      issues: page.map(
        (i): IssueWithGraphState => ({
          id: i.id,
          title: i.title,
          instruction: i.instruction,
          status: i.status,
          priority: i.priority,
          dependencies: i.dependencies,
          blockedBy: i.blockedBy,
          agentCategory: i.agentCategory,
          createdAt: i.createdAt.toISOString(),
          updatedAt: i.updatedAt.toISOString(),
          startedAt: i.startedAt ? i.startedAt.toISOString() : null,
          completedAt: i.completedAt ? i.completedAt.toISOString() : null,
          threadId: i.threadId,
          graphState: i.graphState
            ? {
                currentNode: i.graphState.currentNode,
                status: i.graphState.status,
                interruptReason: i.graphState.interruptReason,
                lastTransitionAt: i.graphState.lastTransitionAt.toISOString(),
              }
            : null,
        }),
      ),
      ledgerTotal: ledgerAgg._sum.tokensUsed ?? 0,
      workerCounts,
      nextCursor,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/state error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
