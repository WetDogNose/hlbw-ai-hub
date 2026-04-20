// Pass 15 — Embedding provider interface.
//
// Context-builder ingredient #1: turn arbitrary text into a fixed-dimensional
// vector so we can query `MemoryStore` and `CodeIndex` by L2 distance (pgvector
// `<->`). Implementations:
//   - `VertexEmbeddingProvider` — real Gemini `text-embedding-004` (768-dim).
//   - `StubEmbeddingProvider`  — deterministic hash-based 768-dim; tests only.
//
// The `EmbeddingProvider` contract is intentionally narrow — a batch `embed`
// plus an optional `close`. Keeps concrete providers swappable and test-mockable.
//
// Design invariants:
//   - `dim` is stable per provider; the context-builder asserts against it
//     before passing the vector downstream.
//   - `embed` MUST return one vector per input text, in the same order.
//   - Throwing from `embed` is a legitimate failure mode — the `build_context`
//     node catches and falls back to the pass-9 static prompt.

export interface EmbeddingProvider {
  /** Stable provider identifier (`"vertex-text-embedding-004"`, `"stub-hash"`). */
  readonly name: string;
  /** Vector dimensionality. Matches the pgvector `vector(768)` schema. */
  readonly dim: number;
  /** Batch embed. Output length === input length, same order. */
  embed(texts: string[]): Promise<number[][]>;
  /** Optional cleanup; no-op for most providers. */
  close?(): Promise<void>;
}
