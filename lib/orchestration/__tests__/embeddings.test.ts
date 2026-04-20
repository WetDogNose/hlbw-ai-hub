// Pass 15 — Unit tests for the embeddings module.
//
// Covers:
//   - StubEmbeddingProvider returns a 768-element vector and is deterministic.
//   - createEmbeddingProvider picks Stub when GEMINI_API_KEY is unset, Vertex
//     when it is set (identified via the `name` property).

import { describe, expect, it, beforeEach, afterEach } from "@jest/globals";

import {
  StubEmbeddingProvider,
  VertexEmbeddingProvider,
  createEmbeddingProvider,
  resetEmbeddingProvider,
} from "../embeddings";

describe("StubEmbeddingProvider", () => {
  it("returns a 768-element vector for a single input", async () => {
    const p = new StubEmbeddingProvider();
    const [vec] = await p.embed(["hello"]);
    expect(Array.isArray(vec)).toBe(true);
    expect(vec).toHaveLength(768);
    expect(p.dim).toBe(768);
    expect(p.name).toBe("stub-hash");
  });

  it("is deterministic: same input → same vector", async () => {
    const p = new StubEmbeddingProvider();
    const [a] = await p.embed(["deterministic"]);
    const [b] = await p.embed(["deterministic"]);
    expect(a).toEqual(b);
  });

  it("embeds a batch preserving order", async () => {
    const p = new StubEmbeddingProvider();
    const out = await p.embed(["alpha", "beta", "gamma"]);
    expect(out).toHaveLength(3);
    // Each entry is a 768-dim vector distinct from the others.
    expect(out[0]).toHaveLength(768);
    expect(out[0]).not.toEqual(out[1]);
    expect(out[1]).not.toEqual(out[2]);
  });
});

describe("createEmbeddingProvider factory", () => {
  const prevKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    resetEmbeddingProvider();
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (prevKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = prevKey;
    }
    resetEmbeddingProvider();
  });

  it("returns StubEmbeddingProvider when GEMINI_API_KEY is unset", () => {
    const p = createEmbeddingProvider();
    expect(p).toBeInstanceOf(StubEmbeddingProvider);
    expect(p.name).toBe("stub-hash");
  });

  it("returns a Vertex-backed provider (resilient wrapper) when GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "test-key-does-not-call-network";
    const p = createEmbeddingProvider();
    // Factory returns ResilientEmbeddingProvider which forwards `name` + `dim`
    // from the wrapped VertexEmbeddingProvider and falls back to Stub on error.
    expect(p.name).toBe("vertex-embedding");
    expect(p.dim).toBe(768);
  });
});
