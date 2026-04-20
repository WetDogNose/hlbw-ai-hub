// Pass 21 — SCION memory browser endpoint.
//
// GET /api/scion/memory?kind=<kind>&cursor=<id>&limit=<n>
// Returns a page of MemoryEpisode rows for the memory browser in SCION.
// Cursor pagination keyed on `createdAt DESC, id DESC`.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { MemoryEpisodeKind } from "@/lib/orchestration/memory/MemoryStore";

export interface MemoryRow {
  id: string;
  taskId: string | null;
  kind: MemoryEpisodeKind;
  agentCategory: string | null;
  summary: string;
  content: unknown;
  createdAt: string;
}

export interface ScionMemoryResponse {
  rows: MemoryRow[];
  nextCursor: string | null;
  count?: number;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const ALLOWED_KINDS: ReadonlyArray<MemoryEpisodeKind> = [
  "task_context",
  "discovery",
  "decision",
  "entity",
  "observation",
  "relation",
];

function isValidKind(k: string): k is MemoryEpisodeKind {
  return (ALLOWED_KINDS as ReadonlyArray<string>).includes(k);
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const kindRaw = url.searchParams.get("kind");
  const cursor = url.searchParams.get("cursor");
  const limitRaw = url.searchParams.get("limit");
  const countMode = url.searchParams.get("count") === "1";

  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const where: { kind?: MemoryEpisodeKind } = {};
  if (kindRaw && isValidKind(kindRaw)) where.kind = kindRaw;

  try {
    // Pass 24 — count-only mode for the CodeIndexPanel.
    if (countMode) {
      const count = await prisma.memoryEpisode.count({ where });
      const body: ScionMemoryResponse = {
        rows: [],
        nextCursor: null,
        count,
      };
      return NextResponse.json(body, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const rows = await prisma.memoryEpisode.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        taskId: true,
        kind: true,
        agentCategory: true,
        summary: true,
        content: true,
        createdAt: true,
      },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].id : null;
    const body: ScionMemoryResponse = {
      rows: page.map(
        (r): MemoryRow => ({
          id: r.id,
          taskId: r.taskId,
          kind: r.kind as MemoryEpisodeKind,
          agentCategory: r.agentCategory,
          summary: r.summary,
          content: r.content,
          createdAt: r.createdAt.toISOString(),
        }),
      ),
      nextCursor,
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/memory error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
