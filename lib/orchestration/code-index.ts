// Pass 15 — Code-symbol index interface + shared types.
//
// Context-builder ingredient #2. At ranking time the builder asks the code
// index for the top-k symbols nearest to the task-instruction embedding.
//
// Storage strategy (decisions.md follow-up):
//   Reuse the existing `memory_episode` table by writing symbols with
//   `kind: "entity"` and a `content` JSON payload that carries the symbol
//   metadata. This avoids a new Prisma migration for pass 15.
//
// The default implementation `PgvectorCodeIndex` lives under
// `lib/orchestration/code-index/PgvectorCodeIndex.ts` and wraps a
// `MemoryStore` (Pass 7). Tests use a lightweight in-memory fake injected
// through the `CodeIndex` interface.
//
// Symbol seeding is OUT OF SCOPE for pass 15. The index starts empty. A
// future pass (or a maintenance script such as the eventual
// `scripts/seed-code-symbols.ts`) walks the codebase via the AST-analyzer
// MCP and calls `upsert`. The context-builder tolerates an empty result and
// degrades gracefully.

export type CodeSymbolKind =
  | "function"
  | "class"
  | "const"
  | "type"
  | "interface"
  | "module";

export interface CodeSymbol {
  /** Stable identifier: `<relativePath>#<symbolName>`. */
  id: string;
  /** Workspace-relative file path. */
  path: string;
  /** Symbol name as written in source. */
  name: string;
  /** Symbol kind; used for display + filtering. */
  kind: CodeSymbolKind;
  /** First JSDoc line or first ~140 chars of body. Short by contract. */
  summary: string;
  /** Typed signature where applicable (functions / methods / interfaces). */
  signature?: string;
}

export interface CodeSymbolSimilarity extends CodeSymbol {
  /** L2 distance between query and stored embedding. */
  distance: number;
}

export interface CodeSymbolQueryOptions {
  limit?: number;
  /** Substring match against `symbol.path`. Used to scope queries. */
  pathFilter?: string;
}

export interface CodeIndex {
  /**
   * Nearest-neighbour search by embedding. Ordered by L2 distance ascending.
   * Returns `[]` when the index is empty — callers must handle this.
   */
  queryBySimilarity(
    embedding: number[],
    opts?: CodeSymbolQueryOptions,
  ): Promise<CodeSymbolSimilarity[]>;

  /**
   * Insert-or-replace a symbol with its embedding. Called by the future
   * seeder; pass 15 does not invoke it in production paths.
   */
  upsert(symbol: CodeSymbol, embedding: number[]): Promise<void>;

  /** Release any pooled resources. */
  close(): Promise<void>;
}
