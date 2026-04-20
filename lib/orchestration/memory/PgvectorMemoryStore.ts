// Pass 7 — default MemoryStore implementation backed by Postgres + pgvector.
//
// SDK signatures verified against:
//   - node_modules/@prisma/client/runtime/library.d.ts (`$queryRaw`,
//     `$executeRaw`, `$queryRawUnsafe`)
//   - node_modules/.prisma/client/index.d.ts line 405-409
//     (`Prisma.sql`, `Prisma.raw`)

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  MemoryStore,
  MemoryEpisode,
  MemoryEpisodeKind,
  MemoryEpisodeSimilarity,
  SimilarityQueryOptions,
  WriteEpisodeInput,
} from "./MemoryStore";

type RawEpisode = {
  id: string;
  taskId: string | null;
  kind: string;
  agentCategory: string | null;
  content: unknown;
  summary: string;
  createdAt: Date;
};

type RawSimilarityEpisode = RawEpisode & { distance: number | string };

function serializeVector(embedding: number[]): string {
  // Pgvector text literal: '[0.1,0.2,...]'.
  return `[${embedding.map((n) => Number(n).toString()).join(",")}]`;
}

function toMemoryEpisode(row: RawEpisode): MemoryEpisode {
  return {
    id: row.id,
    taskId: row.taskId,
    kind: row.kind as MemoryEpisodeKind,
    agentCategory: row.agentCategory,
    content: row.content,
    summary: row.summary,
    createdAt: row.createdAt,
  };
}

export class PgvectorMemoryStore implements MemoryStore {
  async write(ep: WriteEpisodeInput): Promise<string> {
    // Two code paths:
    //   - embedding provided → raw INSERT so we can cast the array to `vector`
    //   - no embedding → normal prisma model create (keeps embedding NULL)
    if (ep.embedding && ep.embedding.length > 0) {
      const vectorLiteral = serializeVector(ep.embedding);
      const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "memory_episode"
          ("id", "taskId", "kind", "agentCategory", "content", "summary", "embedding", "createdAt")
        VALUES (
          gen_random_uuid()::text,
          ${ep.taskId},
          ${ep.kind},
          ${ep.agentCategory},
          ${JSON.stringify(ep.content ?? null)}::jsonb,
          ${ep.summary},
          ${vectorLiteral}::vector,
          NOW()
        )
        RETURNING "id"
      `);
      return rows[0]?.id ?? "";
    }

    // Without an embedding we can use the generated prisma client directly.
    // The `embedding` column is nullable in the schema so omitting it is safe.
    const created = await prisma.memoryEpisode.create({
      data: {
        taskId: ep.taskId,
        kind: ep.kind,
        agentCategory: ep.agentCategory,
        content: (ep.content ?? null) as Prisma.InputJsonValue,
        summary: ep.summary,
      },
      select: { id: true },
    });
    return created.id;
  }

  async queryByTask(
    taskId: string,
    limit: number = 50,
  ): Promise<MemoryEpisode[]> {
    const rows = await prisma.memoryEpisode.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        taskId: true,
        kind: true,
        agentCategory: true,
        content: true,
        summary: true,
        createdAt: true,
      },
    });
    return rows.map((r) =>
      toMemoryEpisode({
        ...r,
        content: r.content as unknown,
      }),
    );
  }

  async queryByKind(
    kind: MemoryEpisodeKind,
    limit: number = 50,
  ): Promise<MemoryEpisode[]> {
    const rows = await prisma.memoryEpisode.findMany({
      where: { kind },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        taskId: true,
        kind: true,
        agentCategory: true,
        content: true,
        summary: true,
        createdAt: true,
      },
    });
    return rows.map((r) =>
      toMemoryEpisode({
        ...r,
        content: r.content as unknown,
      }),
    );
  }

  async queryBySimilarity(
    embedding: number[],
    opts: SimilarityQueryOptions = {},
  ): Promise<MemoryEpisodeSimilarity[]> {
    const limit = opts.limit ?? 10;
    const vectorLiteral = serializeVector(embedding);

    // `<->` is the L2 distance operator. Matched to `vector_l2_ops` index.
    // Filters are passed positionally via `Prisma.sql` so values are bound
    // safely — never string-concatenated.
    const whereClauses: Prisma.Sql[] = [];
    if (opts.kind !== undefined) {
      whereClauses.push(Prisma.sql`"kind" = ${opts.kind}`);
    }
    if (opts.agentCategory !== undefined) {
      whereClauses.push(Prisma.sql`"agentCategory" = ${opts.agentCategory}`);
    }
    const whereSql =
      whereClauses.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(whereClauses, " AND ")}`
        : Prisma.empty;

    const rows = await prisma.$queryRaw<RawSimilarityEpisode[]>(Prisma.sql`
      SELECT
        "id",
        "taskId",
        "kind",
        "agentCategory",
        "content",
        "summary",
        "createdAt",
        ("embedding" <-> ${vectorLiteral}::vector) AS "distance"
      FROM "memory_episode"
      ${whereSql}
      ORDER BY "embedding" <-> ${vectorLiteral}::vector ASC
      LIMIT ${limit}
    `);

    return rows.map((r) => ({
      ...toMemoryEpisode(r),
      distance:
        typeof r.distance === "string" ? Number(r.distance) : r.distance,
    }));
  }

  async close(): Promise<void> {
    // The prisma singleton is shared across the process; we avoid calling
    // `$disconnect()` from individual stores so tests and route handlers
    // don't accidentally race each other. Callers that really own the
    // process (worker subprocess exit) should call `prisma.$disconnect()`
    // directly.
  }
}

// Module-level lazy singleton. Tests that need to replace the implementation
// do so via `jest.mock('@/lib/orchestration/memory/PgvectorMemoryStore')`.
let instance: PgvectorMemoryStore | null = null;

export function getPgvectorMemoryStore(): PgvectorMemoryStore {
  if (!instance) {
    instance = new PgvectorMemoryStore();
  }
  return instance;
}
