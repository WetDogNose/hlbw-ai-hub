// Pass 15 — Stub embedding provider for tests.
//
// Produces a deterministic 768-dim unit vector from a lightweight char-code
// hash of the input text. Zero cost, no network, same input → same vector.
// Not cryptographic; not a real semantic embedding — purely so tests can
// exercise `queryBySimilarity` code paths without mocking the SDK.

import type { EmbeddingProvider } from "./EmbeddingProvider";

const STUB_DIM = 768;

function hashText(text: string): number {
  // FNV-1a 32-bit. Returns an unsigned 32-bit integer.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function seededRand(seed: number): () => number {
  // Mulberry32 — tiny, deterministic PRNG.
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class StubEmbeddingProvider implements EmbeddingProvider {
  readonly name = "stub-hash";
  readonly dim = STUB_DIM;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const rand = seededRand(hashText(t));
      // Values in [-1, 1], then L2-normalise for stability.
      const raw: number[] = new Array(STUB_DIM);
      let sumSq = 0;
      for (let i = 0; i < STUB_DIM; i++) {
        const v = rand() * 2 - 1;
        raw[i] = v;
        sumSq += v * v;
      }
      const norm = Math.sqrt(sumSq) || 1;
      for (let i = 0; i < STUB_DIM; i++) raw[i] = raw[i] / norm;
      return raw;
    });
  }
}
