// SCION threads endpoint.
//
// GET /api/scion/threads?limit=<n>&cursor=<id>
//   Returns a paginated list of Thread rows with their issue count and most
//   recent activity timestamp. Cursor pagination keyed on
//   `updatedAt DESC, id DESC` (matches the memory browser style).
//
// POST /api/scion/threads
//   Body: { title: string }
//   Admin-only (requireAdmin). Audited via recordAdminAction.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";

export interface ThreadRow {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  issueCount: number;
  lastActivityAt: string;
}

export interface ScionThreadsResponse {
  rows: ThreadRow[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limitRaw = url.searchParams.get("limit");

  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  try {
    const threads = await prisma.thread.findMany({
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { issues: true } },
        issues: {
          orderBy: [{ updatedAt: "desc" }],
          take: 1,
          select: { updatedAt: true },
        },
      },
    });

    const hasMore = threads.length > limit;
    const page = hasMore ? threads.slice(0, limit) : threads;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const body: ScionThreadsResponse = {
      rows: page.map((t): ThreadRow => {
        const lastIssue = t.issues[0];
        const lastActivity = lastIssue?.updatedAt ?? t.updatedAt;
        return {
          id: t.id,
          title: t.title,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          issueCount: t._count.issues,
          lastActivityAt: lastActivity.toISOString(),
        };
      }),
      nextCursor,
    };

    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/threads error:", error);
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

  let title: string;
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
    const raw = body.title;
    if (typeof raw !== "string") {
      return NextResponse.json(
        { error: "title must be a string" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    title = raw.trim();
    if (title.length === 0) {
      return NextResponse.json(
        { error: "title must not be empty" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (title.length > 200) {
      return NextResponse.json(
        { error: "title too long (max 200 chars)" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const thread = await prisma.thread.create({
      data: { title },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await recordAdminAction(user, "thread.create", {
      threadId: thread.id,
      title: thread.title,
    });
    return NextResponse.json(
      {
        ok: true,
        thread: {
          id: thread.id,
          title: thread.title,
          createdAt: thread.createdAt.toISOString(),
          updatedAt: thread.updatedAt.toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "create failed";
    console.error("/api/scion/threads POST error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
