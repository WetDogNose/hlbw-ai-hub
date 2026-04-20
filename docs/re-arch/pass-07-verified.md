# Pass 07 verified

**Cycles**: 1. **Verdict**: ESCALATE (expected per D5).

## What's now true
- `prisma/schema.prisma`: new `MemoryEpisode` model — `id`, `taskId`, `kind`, `agentCategory`, `content Json`, `summary`, `embedding Unsupported("vector(768)")?`, `createdAt` + indexes + `@@map("memory_episode")`.
- Drafted migration `prisma/migrations/20260420032326_memory_episode/migration.sql`: `CREATE EXTENSION IF NOT EXISTS vector;` + `CREATE TABLE` + btree indexes + ivfflat index on `embedding`. Leading "DO NOT apply automatically" comment present.
- New `lib/orchestration/memory/MemoryStore.ts` — interface with `write` / `queryByTask` / `queryByKind` / `queryBySimilarity` / `close`.
- New `lib/orchestration/memory/PgvectorMemoryStore.ts` — default impl. `queryBySimilarity` uses `<->` (L2) matching the `vector_l2_ops` ivfflat index. Parameterized SQL throughout.
- New `lib/orchestration/memory/Neo4jReadAdapter.ts` — read-only fallback; write methods throw with deprecation.
- `scripts/swarm/shared-memory.ts` rewritten as a thin adapter. All 9 public exports preserved; each delegates to `MemoryStore`. `MEMORY_READ_LEGACY=1` env flag toggles the Neo4j read fallback.
- Embedding generation deliberately deferred to pass 15 (context-window builder). `write` accepts optional `embedding: number[]`.
- Test gate: `prisma validate`, `prisma generate`, `test:types`, `test:swarm:types`, `npm test` (3 suites / 11 tests), `lint` (78 warnings / 0 errors). New `memory-store.test.ts` (5 tests) passes via direct `npx jest`.

## Frozen this pass
- Memory interface: `MemoryStore` lives in `lib/orchestration/memory/`. `PgvectorMemoryStore` is the default; `Neo4jReadAdapter` is read-only legacy.
- Vector dim: 768 (matches Vertex `text-embedding-004`). L2 distance is canonical.
- Table name: `memory_episode` (snake_case via `@@map`).
- `shared-memory.ts` public API contract is untouched — callers never change.

## USER ACTION REQUIRED — dispatcher is paused
Before pass 8 can dispatch, with the Cloud SQL proxy still running and `.env` still pointing at `127.0.0.1:5433`:

```
cd c:/Users/Jason/repos/hlbw-ai-hub
npx prisma migrate dev --name memory_episode
```

**pgvector prerequisite**: Cloud SQL for Postgres 15 ships `pgvector` pre-installed as an available extension since ~2024. The `CREATE EXTENSION IF NOT EXISTS vector;` in the migration needs the connecting role to have `cloudsqlsuperuser` OR the extension must already be enabled on the instance. If `CREATE EXTENSION` errors with permission denied, run once as `postgres` via `gcloud sql connect hlbw-ai-hub-db-instance --user=postgres` then retry `migrate dev`.

Reply with the migrate output (success or error). Pass 8 starts the StateGraph runtime — another migration will be drafted and escalated at the end of that pass.

## Open carry-forward
- Scheduler wiring, worker persistence, 13 extra Tailwind files, lint warnings — unchanged.
