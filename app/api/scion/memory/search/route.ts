// Pass 23 — POST /api/scion/memory/search
//
// Body: { query: string; limit?: number; kind?: MemoryEpisodeKind }
//
// Embeds the query via the process embedding provider, then asks the
// MemoryStore for top-k similar episodes via `queryBySimilarity`. Read-only;
// admin-gated to keep the similarity surface symmetric with the DELETE route.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { createEmbeddingProvider } from "@/lib/orchestration/embeddings";
import { getPgvectorMemoryStore } from "@/lib/orchestration/memory/PgvectorMemoryStore";
import type {
  MemoryEpisodeKind,
  MemoryEpisodeSimilarity,
} from "@/lib/orchestration/memory/MemoryStore";

export interface MemorySearchRow {
  id: string;
  taskId: string | null;
  kind: MemoryEpisodeKind;
  agentCategory: string | null;
  summary: string;
  content: unknown;
  createdAt: string;
  distance: number;
}

export interface ScionMemorySearchResponse {
  rows: MemorySearchRow[];
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

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

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  let body: { query?: unknown; limit?: unknown; kind?: unknown };
  try {
    body =
      ((await req.json().catch(() => null)) as Record<string, unknown>) ?? {};
  } catch {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const query = body.query;
  if (typeof query !== "string" || query.trim().length === 0) {
    return NextResponse.json(
      { error: "query string required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let limit = DEFAULT_LIMIT;
  if (body.limit !== undefined) {
    const v = body.limit;
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      return NextResponse.json(
        { error: "limit must be a positive number" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    limit = Math.min(Math.floor(v), MAX_LIMIT);
  }

  let kind: MemoryEpisodeKind | undefined;
  if (body.kind !== undefined) {
    if (typeof body.kind !== "string" || !isValidKind(body.kind)) {
      return NextResponse.json(
        { error: "invalid kind" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    kind = body.kind;
  }

  try {
    const embeddings = createEmbeddingProvider();
    const vecs = await embeddings.embed([query]);
    const vec = vecs[0];
    if (!vec || vec.length === 0) {
      return NextResponse.json(
        { error: "embedding failed" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    const store = getPgvectorMemoryStore();
    const hits: MemoryEpisodeSimilarity[] = await store.queryBySimilarity(vec, {
      limit,
      ...(kind ? { kind } : {}),
    });
    const rows: MemorySearchRow[] = hits.map((h) => ({
      id: h.id,
      taskId: h.taskId,
      kind: h.kind,
      agentCategory: h.agentCategory,
      summary: h.summary,
      content: h.content,
      createdAt: h.createdAt.toISOString(),
      distance: h.distance,
    }));
    const response: ScionMemorySearchResponse = { rows };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "search failed";
    console.error("/api/scion/memory/search error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
