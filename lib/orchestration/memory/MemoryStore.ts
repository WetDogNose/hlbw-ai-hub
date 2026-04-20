// Pass 7 — single episodic memory layer interface.
//
// All swarm-side writers route through this contract. The default
// implementation is `PgvectorMemoryStore` (Postgres + pgvector per
// decisions.md D1). `Neo4jReadAdapter` supplies a deprecated read-only
// fallback for historical data and is selected via `MEMORY_READ_LEGACY=1`.

export type MemoryEpisodeKind =
  | "task_context"
  | "discovery"
  | "decision"
  | "entity"
  | "observation"
  | "relation";

export interface MemoryEpisode {
  id: string;
  taskId: string | null;
  kind: MemoryEpisodeKind;
  agentCategory: string | null;
  content: unknown;
  summary: string;
  createdAt: Date;
}

export interface MemoryEpisodeSimilarity extends MemoryEpisode {
  distance: number;
}

export interface WriteEpisodeInput extends Omit<
  MemoryEpisode,
  "id" | "createdAt"
> {
  embedding?: number[];
}

export interface SimilarityQueryOptions {
  limit?: number;
  kind?: MemoryEpisodeKind;
  agentCategory?: string;
}

export interface MemoryStore {
  /**
   * Insert an episode. Returns the new row id.
   * If `embedding` is omitted the vector column is left NULL; Pass 15 wires
   * the real Vertex `text-embedding-004` call.
   */
  write(ep: WriteEpisodeInput): Promise<string>;

  /** Episodes attached to a specific task, newest first. */
  queryByTask(taskId: string, limit?: number): Promise<MemoryEpisode[]>;

  /** Episodes of a specific kind, newest first. */
  queryByKind(
    kind: MemoryEpisodeKind,
    limit?: number,
  ): Promise<MemoryEpisode[]>;

  /**
   * Nearest-neighbour search by embedding. Ordered by L2 distance ascending.
   * Requires the pgvector `ivfflat (vector_l2_ops)` index.
   */
  queryBySimilarity(
    embedding: number[],
    opts?: SimilarityQueryOptions,
  ): Promise<MemoryEpisodeSimilarity[]>;

  /** Release any pooled resources (drivers, prisma $disconnect, etc.). */
  close(): Promise<void>;
}
