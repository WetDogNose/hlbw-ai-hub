# Pass 15 result

## Changed files
- lib/orchestration/embeddings/EmbeddingProvider.ts: new interface (name, dim, embed, optional close).
- lib/orchestration/embeddings/VertexEmbeddingProvider.ts: new — `@google/generative-ai` `embedContent` + `batchEmbedContents` wrapper, model `text-embedding-004`, 768-dim, batch-first with per-text fan-out fallback (concurrency 8).
- lib/orchestration/embeddings/StubEmbeddingProvider.ts: new — deterministic FNV-1a + Mulberry32 unit vector for tests; 768-dim.
- lib/orchestration/embeddings/index.ts: new — `createEmbeddingProvider`, `getEmbeddingProvider` singleton, `resetEmbeddingProvider` test hook.
- lib/orchestration/code-index.ts: new — `CodeSymbol`, `CodeSymbolKind`, `CodeSymbolSimilarity`, `CodeSymbolQueryOptions`, `CodeIndex` (`queryBySimilarity`, `upsert`, `close`). Symbol seeding TBD — run `scripts/seed-code-symbols.ts` after pass 20; empty index returns `[]`.
- lib/orchestration/code-index/PgvectorCodeIndex.ts: new — default impl, reuses `memory_episode` with `kind: "entity"` (no schema change).
- lib/orchestration/context-builder.ts: new — `buildDynamicContext`, `BuildContextInput`, `BuildContextOutput`, `BuildContextChunk`, `BuildContextDeps`, `approxTokens`. Packs rubric → memory (budget quarter) → symbols (budget quarter) → tool catalogue (mandatory, compacts on pressure) → trace summaries (optional) → task instruction (mandatory, last). Scores hits by `1 / (1 + distance)`. Truncates lowest-weight non-mandatory chunks to fit budget. `Math.ceil(chars/4)` token approximation, documented.
- scripts/swarm/runner/deps.ts: new — lazy singleton for `{memory, codeIndex, embeddings}`; `setRunnerDeps` test hook.
- scripts/swarm/runner/nodes.ts: `build_context` rewritten — calls `buildDynamicContext`; on throw logs warning and falls back to `buildStaticContext` (pass-9 body extracted). `RunnerContext.contextBuildMeta` added + populated. New `DEFAULT_CONTEXT_TOKEN_BUDGET = 20_000`.
- lib/orchestration/__tests__/context-builder.test.ts: new — 3 tests (packing order, budget truncation, empty retrieval).
- lib/orchestration/__tests__/embeddings.test.ts: new — 5 tests (stub shape + determinism + batch order, factory selects Stub vs Vertex by `GEMINI_API_KEY`).
- scripts/swarm/runner/__tests__/build-context-node.test.ts: new — 2 tests (happy path writes systemPrompt + meta; fallback path on throw renders static prompt and still routes to `explore`).

## New symbols (with location)
- `EmbeddingProvider` interface at lib/orchestration/embeddings/EmbeddingProvider.ts:14
- `VertexEmbeddingProvider` class at lib/orchestration/embeddings/VertexEmbeddingProvider.ts:28
- `StubEmbeddingProvider` class at lib/orchestration/embeddings/StubEmbeddingProvider.ts:33
- `createEmbeddingProvider` at lib/orchestration/embeddings/index.ts:22
- `getEmbeddingProvider` at lib/orchestration/embeddings/index.ts:30
- `resetEmbeddingProvider` at lib/orchestration/embeddings/index.ts:35
- `CodeSymbol` / `CodeSymbolKind` / `CodeSymbolSimilarity` / `CodeSymbolQueryOptions` / `CodeIndex` at lib/orchestration/code-index.ts:23 / 28 / 41 / 49 / 54
- `PgvectorCodeIndex` class at lib/orchestration/code-index/PgvectorCodeIndex.ts:38
- `buildDynamicContext` at lib/orchestration/context-builder.ts:126
- `BuildContextInput` / `BuildContextOutput` / `BuildContextChunk` / `BuildContextDeps` / `approxTokens` at lib/orchestration/context-builder.ts:45 / 75 / 63 / 84 / 92
- `getRunnerDeps` / `setRunnerDeps` / `RunnerDeps` at scripts/swarm/runner/deps.ts:16 / 22 / 27
- `DEFAULT_CONTEXT_TOKEN_BUDGET` at scripts/swarm/runner/nodes.ts
- `buildStaticContext` (private helper) at scripts/swarm/runner/nodes.ts
- `RunnerContext.contextBuildMeta` field at scripts/swarm/runner/nodes.ts

## Deleted symbols
- none

## New deps
- none (uses `@google/generative-ai@^0.24.1` and `@google-cloud/vertexai@^1.9.0` already in package.json; verified against `node_modules/@google/generative-ai/dist/generative-ai.d.ts` lines 227/786/794 for `ContentEmbedding.values: number[]`, `embedContent`, `batchEmbedContents`).

## Verifier output
- npx prisma validate: PASS
- npm run test:types: PASS
- npm run test:swarm:types: PASS
- npm test: PASS (11 suites / 87 tests + 1 skipped; new: 3 context-builder + 5 embeddings)
- npm run lint: PASS (0 errors, 69 warnings; ≤79 cap)
- npx jest lib/orchestration/__tests__/context-builder.test.ts: PASS (3/3)
- npx jest lib/orchestration/__tests__/embeddings.test.ts: PASS (5/5)
- npx jest --config jest.config.ts --testPathIgnorePatterns '/node_modules/' --roots '<rootDir>/scripts/swarm/runner/__tests__/' --testRegex 'build-context-node\.test\.ts$': PASS (2/2)
- npx jest --config jest.config.ts --testPathIgnorePatterns '/node_modules/' --roots '<rootDir>/scripts/swarm/runner/__tests__/': PASS (3 suites / 23 tests)
- npm run build: PASS

## SDK signature verification
- `@google/generative-ai` `GenerativeModel.embedContent` verified at node_modules/@google/generative-ai/dist/generative-ai.d.ts:786.
- `@google/generative-ai` `GenerativeModel.batchEmbedContents` verified at node_modules/@google/generative-ai/dist/generative-ai.d.ts:794.
- `ContentEmbedding.values: number[]` verified at node_modules/@google/generative-ai/dist/generative-ai.d.ts:227.
- `BatchEmbedContentsResponse.embeddings: ContentEmbedding[]` verified at node_modules/@google/generative-ai/dist/generative-ai.d.ts:50.

## Open issues / deferred
- Symbol seeder script — not written this pass. Empty index is tolerated (`queryBySimilarity` returns `[]`, builder degrades gracefully to rubric + tool catalogue + instruction).
- Tailwind residue (13 files), scheduler wiring, lint warnings (69), worker-JSON legacy, dead-code cull — unchanged carry-forward from checkpoint-10.
- `provider-contract.test.ts` empty-suite failure is pre-existing (logged in checkpoint-10 open-carry-forward "scheduled for pass 20 cull").
- Pass 18 will wire real OTEL trace summaries into `BuildContextInput.recentTraceSummaries`.

## Cross-repo impact
- none
