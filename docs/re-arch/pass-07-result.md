**ESCALATE required before pass 8**

# Pass 07 result

## Changed files
- `prisma/schema.prisma`: added `MemoryEpisode` model (+ `@@map("memory_episode")`, 3 btree indexes, `Unsupported("vector(768)")` embedding column). No other models touched. `Issue.memories` reverse relation deliberately omitted — the `taskId` scalar is sufficient and a relation would require a two-sided model update that the spec said to drop if avoidable.
- `scripts/swarm/shared-memory.ts`: rewritten as a thin adapter over `MemoryStore`. All nine previously-exported function names (`shareTaskContext`, `shareDiscovery`, `shareDecision`, `markTaskComplete`, `storeEntity`, `addObservations`, `createRelation`, `closeMemoryClient`, `getSharedContext`) keep their exact signatures. Neo4j driver imports removed from this file; legacy reads are now reached via the adapter behind `MEMORY_READ_LEGACY=1`.

## New files
- `prisma/migrations/20260420032326_memory_episode/migration.sql` — drafted, NOT applied (decisions.md D5; critic rubric C6).
- `lib/orchestration/memory/MemoryStore.ts` — interface.
- `lib/orchestration/memory/PgvectorMemoryStore.ts` — default impl; uses `prisma.$queryRaw` with `Prisma.sql` tagged templates for `<->` (L2) ANN ordering and vector-typed INSERTs.
- `lib/orchestration/memory/Neo4jReadAdapter.ts` — deprecated read-only adapter. Writes throw with `Neo4jReadAdapter is read-only (Pass 7, decisions.md D1). Route writes through PgvectorMemoryStore.`
- `scripts/swarm/__tests__/memory-store.test.ts` — unit test (5 cases) that mocks `PgvectorMemoryStore` via `jest.mock` and exercises the `shareTaskContext → write`, `shareDiscovery → write*2`, `shareDecision → write*2`, `getSharedContext → queryByKind`, and `closeMemoryClient → close` paths.
- `scripts/swarm/__tests__/memory-store.integration.test.ts` — gated on `DB_TEST=1` and deliberately skipped until the migration is user-applied.

## New symbols (with location)
- `MemoryEpisodeKind` type at `lib/orchestration/memory/MemoryStore.ts:8`
- `MemoryEpisode` interface at `lib/orchestration/memory/MemoryStore.ts:16`
- `MemoryEpisodeSimilarity` interface at `lib/orchestration/memory/MemoryStore.ts:26`
- `WriteEpisodeInput` interface at `lib/orchestration/memory/MemoryStore.ts:30`
- `SimilarityQueryOptions` interface at `lib/orchestration/memory/MemoryStore.ts:35`
- `MemoryStore` interface at `lib/orchestration/memory/MemoryStore.ts:41`
- `PgvectorMemoryStore` class at `lib/orchestration/memory/PgvectorMemoryStore.ts:49`
- `getPgvectorMemoryStore` at `lib/orchestration/memory/PgvectorMemoryStore.ts:198`
- `Neo4jReadAdapter` class at `lib/orchestration/memory/Neo4jReadAdapter.ts:64`
- Prisma `MemoryEpisode` model at `prisma/schema.prisma:260`

## Deleted symbols
- None this pass. The old Neo4j-first `shared-memory.ts` body was rewritten in-place; all nine exports keep their names. No cross-workspace greps needed.

## New deps
- None. `@prisma/client@6.4.1`, `prisma@6.4.1`, and `neo4j-driver@^6.0.1` already present (`package.json`). `$queryRaw`, `$executeRaw`, `Prisma.sql`, and `Prisma.join`/`Prisma.empty` verified in `node_modules/@prisma/client/runtime/library.d.ts:151-155` and `node_modules/.prisma/client/index.d.ts:405-409`.

## Drafted migration — user-gated
- Path: `c:/Users/Jason/repos/hlbw-ai-hub/prisma/migrations/20260420032326_memory_episode/migration.sql`.
- **Exact command for the user**: `cd c:/Users/Jason/repos/hlbw-ai-hub && npx prisma migrate dev --name memory_episode`
- Prerequisite: the target Postgres needs the `vector` extension installable by the invoking role.
  - Cloud SQL Postgres 15 ships pgvector in the default preinstalled extension set (added ~2024). If the instance has not had pgvector enabled yet, `CREATE EXTENSION IF NOT EXISTS vector;` in the migration handles it provided the role is `cloudsqlsuperuser` (the default owner role on Cloud SQL). If the role lacks that privilege the operator runs `gcloud sql instances patch <inst> --database-flags=cloudsql.enable_pgvector=on` (or `CREATE EXTENSION vector;` via a superuser session) once before applying the migration.
  - Embedding dim is 768 to match Vertex `text-embedding-004`. Pass 15 wires the real embedding call; this pass writes `undefined`/NULL embeddings for now.

## Verifier output
- `npx prisma validate`: PASS (exit 0).
- `npx prisma generate`: PASS (exit 0).
- `npm run test:types`: PASS (exit 0).
- `npm run test:swarm:types`: PASS (exit 0).
- `npm test`: PASS (3 suites / 11 tests, matching pass-06 baseline — new swarm tests live outside the root jest run per the pass-5 invariant documented in `checkpoint-05.md`). Out-of-band `npx jest --testPathIgnorePatterns='/node_modules/' --testPathPatterns='scripts/swarm/__tests__/memory-store.test.ts'` runs the new suite: 1 suite / 5 tests pass.
- `npm run lint`: PASS (exit 0, 0 errors, 78 warnings — one warning net below pass-06's 79 ceiling).
- `npm run build`: SKIPPED per pass spec ("Do NOT run `npm run build`").
- `npx prisma migrate dev`: NOT RUN. User-gated per decisions.md D5.

## Open issues / deferred
- Embedding provider is not wired up; `write` accepts an optional `embedding: number[]` and simply stores NULL when omitted. Pass 15 wires the Vertex `text-embedding-004` call from `context-builder.ts`.
- `agent-runner.ts`, `delegate.ts`, `demo-memory-full.ts`, `watchdog.ts` continue to call the preserved `shared-memory.ts` API; no behaviour change expected.
- Integration test (`memory-store.integration.test.ts`) is intentionally minimal — it will not run against a real DB until the migration is user-applied and `DB_TEST=1` is set by the operator.
- Neo4j driver still appears as a transitive dep for `lib/orchestration/memory/Neo4jReadAdapter.ts`; removal is a pass-20 cull candidate once historical reads are confirmed unused.
- Jest root config still excludes `scripts/swarm/__tests__/`; the new unit test is covered by the out-of-band run. Folding the swarm tests into the main jest project is pass-20 work (same scope as `provider-contract.test.ts`).
- `npm test` count stays at the pass-06 floor (3 / 11); no new tests reached the root-project jest because the file lives under the excluded swarm directory.

## Cross-repo impact
- none
