// Pass 24 — POST /api/scion/embeddings/test
//
// Body: { text: string } — 2000 char max.
// Returns { provider, dim, vector: number[12] } — first 12 elements of the
// vector for inspection. Admin-only, audited.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import { createEmbeddingProvider } from "@/lib/orchestration/embeddings";

export interface EmbeddingTestRequest {
  text: string;
}

export interface EmbeddingTestResponse {
  provider: string;
  dim: number;
  vector: number[];
}

const MAX_TEXT_CHARS = 2_000;
const VECTOR_PREVIEW_LENGTH = 12;

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  let body: { text?: unknown };
  try {
    body =
      ((await req.json().catch(() => null)) as { text?: unknown } | null) ?? {};
  } catch {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const text = body.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json(
      { error: "text string required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      { error: `text exceeds ${MAX_TEXT_CHARS} char cap` },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const provider = createEmbeddingProvider();
    const vectors = await provider.embed([text]);
    const vec = vectors[0] ?? [];
    if (vec.length === 0) {
      return NextResponse.json(
        { error: "embedding failed" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    const preview = vec.slice(0, VECTOR_PREVIEW_LENGTH);
    const response: EmbeddingTestResponse = {
      provider: provider.name,
      dim: provider.dim,
      vector: preview,
    };
    await recordAdminAction(user, "embeddings.test", {
      provider: provider.name,
      textLength: text.length,
    });
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "embed failed";
    console.error("/api/scion/embeddings/test error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
