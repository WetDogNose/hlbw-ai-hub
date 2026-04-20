-- Pass 7: MemoryStore via pgvector. DO NOT apply automatically — user must run `npx prisma migrate dev --name memory_episode`. Requires pgvector extension available on the Cloud SQL instance (Postgres 15 supports it via the default preinstalled extensions).

-- Ensure the pgvector extension is present. On Cloud SQL the invoking role
-- must be `cloudsqlsuperuser` (default for the instance owner) for this to
-- succeed; on a self-hosted cluster it requires the Postgres superuser role.
CREATE EXTENSION IF NOT EXISTS vector;

-- Core table for the single episodic memory layer.
CREATE TABLE "memory_episode" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "kind" TEXT NOT NULL,
    "agentCategory" TEXT,
    "content" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_episode_pkey" PRIMARY KEY ("id")
);

-- Secondary btree indexes (matching the @@index declarations in schema.prisma).
CREATE INDEX "memory_episode_taskId_idx" ON "memory_episode"("taskId");
CREATE INDEX "memory_episode_kind_idx" ON "memory_episode"("kind");
CREATE INDEX "memory_episode_createdAt_idx" ON "memory_episode"("createdAt");

-- Pgvector ANN index. `ivfflat` with `lists = 100` is a balanced default for
-- tens-of-thousands to low-millions of rows; retuning is a pure index rebuild.
-- We match this with the `<->` (L2) operator in PgvectorMemoryStore queries.
CREATE INDEX "memory_episode_embedding_idx"
    ON "memory_episode"
    USING ivfflat (embedding vector_l2_ops)
    WITH (lists = 100);
