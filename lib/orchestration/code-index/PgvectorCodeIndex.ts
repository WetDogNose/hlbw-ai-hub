// Pass 15 — Default `CodeIndex` implementation, backed by a `MemoryStore`.
//
// We reuse the existing `memory_episode` table (kind="entity") rather than
// introducing a new Prisma model. Symbol payload is serialized into the
// `content` JSON column; `summary` carries the human-readable one-liner.
// Lookups piggyback on `MemoryStore.queryBySimilarity({ kind: "entity" })`.
//
// Rationale — see code-index.ts header: no schema change means no migration
// for pass 15.

import type {
  CodeIndex,
  CodeSymbol,
  CodeSymbolKind,
  CodeSymbolQueryOptions,
  CodeSymbolSimilarity,
} from "../code-index";
import type {
  MemoryStore,
  MemoryEpisodeSimilarity,
} from "../memory/MemoryStore";

interface StoredSymbolPayload {
  symbolId: string;
  path: string;
  name: string;
  symbolKind: CodeSymbolKind;
  signature?: string;
}

function isStoredSymbolPayload(v: unknown): v is StoredSymbolPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.symbolId === "string" &&
    typeof o.path === "string" &&
    typeof o.name === "string" &&
    typeof o.symbolKind === "string"
  );
}

export class PgvectorCodeIndex implements CodeIndex {
  constructor(private readonly memory: MemoryStore) {}

  async queryBySimilarity(
    embedding: number[],
    opts: CodeSymbolQueryOptions = {},
  ): Promise<CodeSymbolSimilarity[]> {
    const limit = opts.limit ?? 10;
    // Over-fetch when a pathFilter is set so post-filter still returns `limit`.
    const fetchLimit = opts.pathFilter ? Math.max(limit * 4, 20) : limit;
    const rows: MemoryEpisodeSimilarity[] = await this.memory.queryBySimilarity(
      embedding,
      {
        limit: fetchLimit,
        kind: "entity",
      },
    );

    const out: CodeSymbolSimilarity[] = [];
    for (const row of rows) {
      if (!isStoredSymbolPayload(row.content)) continue;
      const p = row.content;
      if (opts.pathFilter && !p.path.includes(opts.pathFilter)) continue;
      out.push({
        id: p.symbolId,
        path: p.path,
        name: p.name,
        kind: p.symbolKind,
        summary: row.summary,
        signature: p.signature,
        distance: row.distance,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  async upsert(symbol: CodeSymbol, embedding: number[]): Promise<void> {
    const payload: StoredSymbolPayload = {
      symbolId: symbol.id,
      path: symbol.path,
      name: symbol.name,
      symbolKind: symbol.kind,
      signature: symbol.signature,
    };
    await this.memory.write({
      taskId: null,
      kind: "entity",
      agentCategory: null,
      content: payload,
      summary: symbol.summary,
      embedding,
    });
  }

  async close(): Promise<void> {
    // The `MemoryStore.close` is a no-op today; provided for symmetry.
    await this.memory.close();
  }
}
