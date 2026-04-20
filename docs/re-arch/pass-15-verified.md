# Pass 15 verified

**Cycles**: 1. **Verdict**: PASS. **Checkpoint-15 written — see that file for the consolidated frozen state.**

## What's now true (headline deliverable)
- `lib/orchestration/context-builder.ts:buildDynamicContext` — embeds task, retrieves top-k memory + symbols, packs by relevance density within a token budget, emits systemPrompt with task instruction LAST.
- Vertex embeddings live: `VertexEmbeddingProvider` uses `@google/generative-ai` with `text-embedding-004` (768-dim, matches pgvector schema). Stub fallback for tests. Factory returns Vertex iff `GEMINI_API_KEY` set.
- `PgvectorCodeIndex` reuses `MemoryEpisode` with `kind:"entity"` — no migration needed. Symbol seeding script TBD (deferred).
- `build_context` node rewritten. On any embedding / retrieval failure: falls back to `buildStaticContext()` (the pass-9 body, preserved as a private helper). Runner never breaks.
- Runner singleton deps in `scripts/swarm/runner/deps.ts` (memoryStore, codeIndex, embeddingProvider).
- Test gate: `prisma validate`, `test:types`, `test:swarm:types`, `npm test` (11 suites / 87 tests + 1 skipped), `lint` (0 errors / 69 warnings), `npm run build` — all PASS.

## Frozen this pass (full list in checkpoint-15.md)
- Dynamic context is the default; static is fallback only.
- Token-budget packing drops lowest-weight chunks first; relevance = `1 / (1 + L2_distance)`.
- Packing order: rubric → memory → symbols → tool catalog → trace summaries → task instruction.

## Open carry-forward
- **Symbol seeder script** (walks repo via AST MCP, upserts `CodeSymbol` rows) — not written this pass. Index starts empty; builder handles this gracefully.
- Real OTEL trace summaries in context are not yet wired (placeholder in `BuildContextInput.recentTraceSummaries`) — pass 18 supplies them.
- 13 extra Tailwind files, scheduler wiring, 69 lint warnings, worker-JSON, dead-code cull — unchanged carry.
