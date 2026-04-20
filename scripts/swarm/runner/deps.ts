// Pass 15 — Runner-side singletons for the dynamic context builder.
//
// Lazy-initialised process-wide instances of `MemoryStore`, `CodeIndex`, and
// `EmbeddingProvider`. The `build_context` node in `runner/nodes.ts` imports
// these; tests override via `setRunnerDeps`.

import type { MemoryStore } from "@/lib/orchestration/memory/MemoryStore";
import type { CodeIndex } from "@/lib/orchestration/code-index";
import type { EmbeddingProvider } from "@/lib/orchestration/embeddings";

import { getPgvectorMemoryStore } from "@/lib/orchestration/memory/PgvectorMemoryStore";
import { PgvectorCodeIndex } from "@/lib/orchestration/code-index/PgvectorCodeIndex";
import { getEmbeddingProvider } from "@/lib/orchestration/embeddings";

export interface RunnerDeps {
  memory: MemoryStore;
  codeIndex: CodeIndex;
  embeddings: EmbeddingProvider;
}

let cached: RunnerDeps | null = null;

export function getRunnerDeps(): RunnerDeps {
  if (!cached) {
    const memory = getPgvectorMemoryStore();
    const codeIndex = new PgvectorCodeIndex(memory);
    const embeddings = getEmbeddingProvider();
    cached = { memory, codeIndex, embeddings };
  }
  return cached;
}

/** Test hook: replace the cached deps (or clear by passing `null`). */
export function setRunnerDeps(next: RunnerDeps | null): void {
  cached = next;
}
