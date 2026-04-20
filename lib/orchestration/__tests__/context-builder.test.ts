// Pass 15 — Unit tests for `buildDynamicContext`.
//
// Covers:
//   - Packs rubric + memory + symbol + tool catalog + task instruction in
//     that order; asserts the instruction is last in the prompt.
//   - Token-budget truncation: drops low-weight chunks to fit.
//   - Empty memory + empty symbols: still produces a coherent prompt.

import { describe, expect, it } from "@jest/globals";

import {
  buildDynamicContext,
  approxTokens,
  type BuildContextInput,
  type BuildContextDeps,
} from "../context-builder";
import type {
  MemoryStore,
  MemoryEpisode,
  MemoryEpisodeKind,
  MemoryEpisodeSimilarity,
  WriteEpisodeInput,
} from "../memory/MemoryStore";
import type {
  CodeIndex,
  CodeSymbol,
  CodeSymbolSimilarity,
} from "../code-index";
import type { EmbeddingProvider } from "../embeddings/EmbeddingProvider";
import { DEFAULT_RUBRIC } from "../rubrics/default";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeEmbedding implements EmbeddingProvider {
  readonly name = "fake";
  readonly dim = 768;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(768).fill(0.01));
  }
}

class FakeMemory implements MemoryStore {
  constructor(private hits: MemoryEpisodeSimilarity[] = []) {}
  async write(_ep: WriteEpisodeInput): Promise<string> {
    return "fake-id";
  }
  async queryByTask(_t: string, _l?: number): Promise<MemoryEpisode[]> {
    return [];
  }
  async queryByKind(
    _k: MemoryEpisodeKind,
    _l?: number,
  ): Promise<MemoryEpisode[]> {
    return [];
  }
  async queryBySimilarity(): Promise<MemoryEpisodeSimilarity[]> {
    return this.hits;
  }
  async close(): Promise<void> {
    // no-op
  }
}

class FakeCodeIndex implements CodeIndex {
  constructor(private hits: CodeSymbolSimilarity[] = []) {}
  async queryBySimilarity(): Promise<CodeSymbolSimilarity[]> {
    return this.hits;
  }
  async upsert(_s: CodeSymbol, _e: number[]): Promise<void> {
    // no-op
  }
  async close(): Promise<void> {
    // no-op
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMemoryHit(
  id: string,
  summary: string,
  distance: number,
): MemoryEpisodeSimilarity {
  return {
    id,
    taskId: "task-xyz",
    kind: "discovery" as MemoryEpisodeKind,
    agentCategory: "1_qa",
    content: { note: summary },
    summary,
    createdAt: new Date("2026-04-01T00:00:00Z"),
    distance,
  };
}

function makeSymbolHit(
  id: string,
  name: string,
  distance: number,
): CodeSymbolSimilarity {
  return {
    id,
    path: `scripts/swarm/${name}.ts`,
    name,
    kind: "function",
    summary: `Summary for ${name}`,
    signature: `function ${name}(): void`,
    distance,
  };
}

function baseInput(over: Partial<BuildContextInput> = {}): BuildContextInput {
  return {
    taskId: "task-xyz",
    taskInstruction: "UNIQUE_TASK_INSTRUCTION_MARKER: do the thing",
    agentCategory: "1_qa",
    rubric: DEFAULT_RUBRIC,
    toolCatalog: [
      { name: "read_file", description: "reads a file" },
      { name: "write_file", description: "writes a file" },
    ],
    tokenBudget: 20_000,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildDynamicContext — packing order", () => {
  it("emits rubric → memory → symbol → tools → instruction with instruction LAST", async () => {
    const memory = new FakeMemory([
      makeMemoryHit("m1", "Memory hit one", 0.1),
      makeMemoryHit("m2", "Memory hit two", 0.2),
      makeMemoryHit("m3", "Memory hit three", 0.3),
    ]);
    const codeIndex = new FakeCodeIndex([
      makeSymbolHit("s1", "firstSymbol", 0.1),
      makeSymbolHit("s2", "secondSymbol", 0.2),
    ]);
    const deps: BuildContextDeps = {
      memory,
      codeIndex,
      embeddings: new FakeEmbedding(),
    };

    const result = await buildDynamicContext(baseInput(), deps);

    // Sources in order.
    const sources = result.chunks.map((c) => c.source);
    expect(sources[0]).toBe("rubric");
    expect(sources[sources.length - 1]).toBe("instruction");

    // All three memory hits and both symbol hits are present (budget is huge).
    const memCount = sources.filter((s) => s === "memory").length;
    const symCount = sources.filter((s) => s === "symbol").length;
    expect(memCount).toBe(3);
    expect(symCount).toBe(2);

    // Instruction text sits last in the prompt.
    const lastChunk = result.chunks[result.chunks.length - 1];
    expect(lastChunk.text).toContain("UNIQUE_TASK_INSTRUCTION_MARKER");
    expect(result.systemPrompt.endsWith(lastChunk.text)).toBe(true);

    // Meta exposes hit counts.
    expect(result.meta.memoryHits).toBe(3);
    expect(result.meta.symbolHits).toBe(2);
    expect(result.meta.tokenBudget).toBe(20_000);
  });
});

describe("buildDynamicContext — token budget", () => {
  it("truncates low-weight chunks when over budget", async () => {
    const manyMemory = Array.from({ length: 12 }, (_v, i) =>
      makeMemoryHit(
        `m${i}`,
        `Memory hit ${i} ` + "x".repeat(300),
        0.1 + i * 0.05,
      ),
    );
    const manySymbols = Array.from({ length: 12 }, (_v, i) =>
      makeSymbolHit(`s${i}`, `sym${i}`, 0.1 + i * 0.05),
    );
    const deps: BuildContextDeps = {
      memory: new FakeMemory(manyMemory),
      codeIndex: new FakeCodeIndex(manySymbols),
      embeddings: new FakeEmbedding(),
    };

    const tight = baseInput({ tokenBudget: 500 });
    const result = await buildDynamicContext(tight, deps);

    const HEADROOM = 1.1;
    expect(result.systemPrompt.length).toBeLessThanOrEqual(500 * 4 * HEADROOM);
    // Mandatory chunks always survive: rubric, tool_catalog, instruction.
    const sources = result.chunks.map((c) => c.source);
    expect(sources).toContain("rubric");
    expect(sources).toContain("tool_catalog");
    expect(sources).toContain("instruction");
    // Instruction must still be last.
    expect(sources[sources.length - 1]).toBe("instruction");
  });
});

describe("buildDynamicContext — empty retrieval", () => {
  it("produces a coherent prompt from rubric + tools + instruction alone", async () => {
    const deps: BuildContextDeps = {
      memory: new FakeMemory([]),
      codeIndex: new FakeCodeIndex([]),
      embeddings: new FakeEmbedding(),
    };
    const result = await buildDynamicContext(baseInput(), deps);

    const sources = result.chunks.map((c) => c.source);
    expect(sources).toEqual(["rubric", "tool_catalog", "instruction"]);
    expect(result.systemPrompt).toContain(DEFAULT_RUBRIC.name);
    expect(result.systemPrompt).toContain("UNIQUE_TASK_INSTRUCTION_MARKER");
    expect(result.meta.memoryHits).toBe(0);
    expect(result.meta.symbolHits).toBe(0);
    expect(result.tokenEstimate).toBe(approxTokens(result.systemPrompt));
  });
});
