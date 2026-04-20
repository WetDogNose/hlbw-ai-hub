// Pass 15 — Embedding provider factory + singleton.
//
// `createEmbeddingProvider()` returns:
//   - `VertexEmbeddingProvider` when `GEMINI_API_KEY` is set (production).
//   - `StubEmbeddingProvider` otherwise (tests, CI without secrets).
//
// Callers hold a per-process singleton via `getEmbeddingProvider()`. The
// context-builder reaches for this singleton; tests that need determinism
// call `resetEmbeddingProvider()` in `beforeEach`.

import type { EmbeddingProvider } from "./EmbeddingProvider";
import { StubEmbeddingProvider } from "./StubEmbeddingProvider";
import { VertexEmbeddingProvider } from "./VertexEmbeddingProvider";

export type { EmbeddingProvider } from "./EmbeddingProvider";
export { StubEmbeddingProvider } from "./StubEmbeddingProvider";
export { VertexEmbeddingProvider } from "./VertexEmbeddingProvider";

let cached: EmbeddingProvider | null = null;

/**
 * Factory. Does not cache — each call returns a new instance. Use
 * `getEmbeddingProvider()` when you want the process-wide singleton.
 */
export function createEmbeddingProvider(): EmbeddingProvider {
  if (process.env.GEMINI_API_KEY) {
    return new VertexEmbeddingProvider();
  }
  return new StubEmbeddingProvider();
}

/** Singleton accessor. Callers should prefer this over `createEmbeddingProvider`. */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cached) cached = createEmbeddingProvider();
  return cached;
}

/** Test hook: drop the cached singleton so the next `get` re-selects based on env. */
export function resetEmbeddingProvider(): void {
  cached = null;
}
