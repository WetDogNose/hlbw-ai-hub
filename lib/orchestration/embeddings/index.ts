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
 * Resilient wrapper. Tries the primary provider; on permanent failure (e.g.
 * Vertex API 404 because the project lacks embedding access) it records the
 * reason on `lastFallbackReason` and routes to `StubEmbeddingProvider` for
 * subsequent calls. Consumers get `EmbeddingProvider` semantics and never 500
 * on embedding unavailability — the cost is retrieval quality (stub vectors
 * are deterministic hash-based, not semantic).
 */
class ResilientEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dim: number;
  private primary: EmbeddingProvider;
  private readonly fallback: StubEmbeddingProvider;
  private usingFallback = false;
  lastFallbackReason: string | null = null;

  constructor(primary: EmbeddingProvider) {
    this.primary = primary;
    this.fallback = new StubEmbeddingProvider();
    this.name = primary.name;
    this.dim = primary.dim;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (this.usingFallback) return this.fallback.embed(texts);
    try {
      return await this.primary.embed(texts);
    } catch (err) {
      this.usingFallback = true;
      this.lastFallbackReason =
        err instanceof Error ? err.message : String(err);
      return this.fallback.embed(texts);
    }
  }

  async close(): Promise<void> {
    await this.primary.close?.();
    // Stub has no resources; skip.
  }
}

/**
 * Factory. Does not cache — each call returns a new instance. Use
 * `getEmbeddingProvider()` when you want the process-wide singleton.
 */
export function createEmbeddingProvider(): EmbeddingProvider {
  if (process.env.GEMINI_API_KEY) {
    return new ResilientEmbeddingProvider(new VertexEmbeddingProvider());
  }
  return new StubEmbeddingProvider();
}

export { ResilientEmbeddingProvider };

/** Singleton accessor. Callers should prefer this over `createEmbeddingProvider`. */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cached) cached = createEmbeddingProvider();
  return cached;
}

/** Test hook: drop the cached singleton so the next `get` re-selects based on env. */
export function resetEmbeddingProvider(): void {
  cached = null;
}
