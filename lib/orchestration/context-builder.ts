// Pass 15 — Dynamic context-window builder.
//
// This is the "SCION swarming builds context dynamically" deliverable. The
// legacy `build_context` node in `scripts/swarm/runner/nodes.ts` dumped the
// full MCP tool catalogue into the Gemini chat regardless of task. This
// builder replaces that static dump with a retrieval-driven, relevance-ranked
// assembly: rubric → top memory hits → top symbol hits → tool catalogue →
// trace summaries → task instruction (last, so it sits freshest in the
// attention window).
//
// Inputs (see `BuildContextInput`):
//   - taskInstruction (embedded via EmbeddingProvider)
//   - agentCategory (filter for memory + rubric load)
//   - rubric (already resolved by the caller via `loadRubric(category)`)
//   - toolCatalog (already filtered by the caller; we truncate under pressure)
//   - tokenBudget (chars/4 heuristic; see note below)
//   - optional recent trace summaries (pass 18 wires real OTEL spans here)
//
// Output:
//   - systemPrompt string with clear section headers.
//   - tokenEstimate (same `ceil(chars/4)` approximation as the budget).
//   - chunks (each with a `source` tag + weight; useful for observability).
//   - meta (memory/symbol hit counts + budget for debugging).
//
// Token estimation note:
//   We use `Math.ceil(text.length / 4)` as a coarse approximation — it is NOT
//   a hard promise of the true tokenizer count. The caller's `tokenBudget` is
//   honoured on this same approximation. If the true count exceeds the budget
//   at provider time, the Actor will still function — signal density is the
//   constraint, not strict token accounting.

import type { Rubric } from "./rubrics/types";
import type {
  MemoryStore,
  MemoryEpisodeSimilarity,
} from "./memory/MemoryStore";
import type { CodeIndex, CodeSymbolSimilarity } from "./code-index";
import type { EmbeddingProvider } from "./embeddings/EmbeddingProvider";

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface BuildContextToolEntry {
  name: string;
  description?: string;
  schema?: unknown;
}

export interface BuildContextInput {
  taskId: string;
  taskInstruction: string;
  agentCategory: string;
  rubric: Rubric;
  toolCatalog: ReadonlyArray<BuildContextToolEntry>;
  /** Chars/4 budget ceiling. Defaults to 20,000 in callers. */
  tokenBudget: number;
  /** Optional OTEL-derived task-lineage summaries. Pass 18 wires real ones. */
  recentTraceSummaries?: ReadonlyArray<string>;
  /** Maximum number of memory hits to retrieve. Defaults to 12. */
  memoryLimit?: number;
  /** Maximum number of symbol hits to retrieve. Defaults to 12. */
  symbolLimit?: number;
}

export interface BuildContextChunk {
  source:
    | "rubric"
    | "memory"
    | "symbol"
    | "tool_catalog"
    | "trace"
    | "instruction";
  /** Relevance weight; higher = more likely to survive budget truncation. */
  weight: number;
  /** Rendered text. */
  text: string;
}

export interface BuildContextOutput {
  systemPrompt: string;
  tokenEstimate: number;
  chunks: BuildContextChunk[];
  meta: {
    memoryHits: number;
    symbolHits: number;
    tokenBudget: number;
  };
}

export interface BuildContextDeps {
  memory: MemoryStore;
  codeIndex: CodeIndex;
  embeddings: EmbeddingProvider;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN_APPROX = 4;

/** Coarse token estimate: `ceil(chars / 4)`. Not a tokenizer. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_APPROX);
}

/** `1 / (1 + distance)` monotonic with similarity. Distance 0 → 1.0. */
function relevance(distance: number): number {
  return 1 / (1 + Math.max(0, distance));
}

function renderRubric(rubric: Rubric): string {
  const header = `# Rubric: ${rubric.name}\n${rubric.description}`;
  const checks = rubric.checks
    .map((c) => `- [${c.id}] ${c.description}`)
    .join("\n");
  return `${header}\n${checks}`;
}

function renderMemoryHit(
  hit: MemoryEpisodeSimilarity,
  weight: number,
): BuildContextChunk {
  const contentStr =
    typeof hit.content === "string"
      ? hit.content
      : JSON.stringify(hit.content ?? null).slice(0, 400);
  const text =
    `## Memory [${hit.kind}${hit.taskId ? `:${hit.taskId}` : ""}] ` +
    `(rel=${weight.toFixed(3)})\n` +
    `${hit.summary}\n${contentStr}`;
  return { source: "memory", weight, text };
}

function renderSymbolHit(
  hit: CodeSymbolSimilarity,
  weight: number,
): BuildContextChunk {
  const sig = hit.signature ? `\n${hit.signature}` : "";
  const text =
    `## Symbol ${hit.path}#${hit.name} [${hit.kind}] ` +
    `(rel=${weight.toFixed(3)})\n` +
    `${hit.summary}${sig}`;
  return { source: "symbol", weight, text };
}

function renderToolCatalog(
  catalog: ReadonlyArray<BuildContextToolEntry>,
  compact: boolean,
): string {
  if (catalog.length === 0) return "# Available tools\n(none)";
  const entries = catalog.map((t) => {
    if (compact) return `- ${t.name}`;
    const desc = (t.description ?? "").slice(0, 160);
    return `- ${t.name}: ${desc}`;
  });
  return `# Available tools\n${entries.join("\n")}`;
}

function renderTraces(summaries: ReadonlyArray<string>): string {
  return `# Recent trace summaries\n${summaries.map((s) => `- ${s}`).join("\n")}`;
}

function renderInstruction(taskId: string, instruction: string): string {
  return `# Task instruction (id=${taskId})\n${instruction}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a dynamic context window for the current task.
 *
 * Algorithm:
 *   1. Embed the task instruction.
 *   2. Parallel: fetch top-k memory hits + top-k symbol hits.
 *   3. Score each hit by `1 / (1 + distance)`; heavier = more relevant.
 *   4. Pack chunks in order: rubric (always) → memory (quarter budget)
 *      → symbols (next quarter) → tool catalog (always; compacts under
 *      pressure) → trace summaries → task instruction (always, LAST).
 *   5. Compute token estimate. If the sum exceeds `tokenBudget`, drop the
 *      lowest-weight non-mandatory chunks first (memory + symbol + trace).
 *
 * Never throws for an empty memory/index — returns a coherent prompt
 * containing at least the rubric, tool catalogue, and task instruction.
 */
export async function buildDynamicContext(
  input: BuildContextInput,
  deps: BuildContextDeps,
): Promise<BuildContextOutput> {
  const memoryLimit = input.memoryLimit ?? 12;
  const symbolLimit = input.symbolLimit ?? 12;
  const tokenBudget = input.tokenBudget;

  // 1. Embed the task instruction.
  const [embedding] = await deps.embeddings.embed([input.taskInstruction]);
  if (!embedding || embedding.length === 0) {
    throw new Error(
      "buildDynamicContext: embedding provider returned empty vector",
    );
  }

  // 2. Parallel retrieval.
  const [memoryHits, symbolHits] = await Promise.all([
    deps.memory.queryBySimilarity(embedding, {
      limit: memoryLimit,
      agentCategory: input.agentCategory,
    }),
    deps.codeIndex.queryBySimilarity(embedding, {
      limit: symbolLimit,
    }),
  ]);

  // 3. Score.
  const scoredMemory = memoryHits.map((h) => ({
    hit: h,
    weight: relevance(h.distance),
  }));
  scoredMemory.sort((a, b) => b.weight - a.weight);

  const scoredSymbols = symbolHits.map((h) => ({
    hit: h,
    weight: relevance(h.distance),
  }));
  scoredSymbols.sort((a, b) => b.weight - a.weight);

  // 4. Pack.
  const chunks: BuildContextChunk[] = [];
  const mandatoryWeight = Number.POSITIVE_INFINITY;

  // Rubric — mandatory.
  const rubricChunk: BuildContextChunk = {
    source: "rubric",
    weight: mandatoryWeight,
    text: renderRubric(input.rubric),
  };
  chunks.push(rubricChunk);

  // Budget pacing: reserve quarter for memory, quarter for symbols.
  let usedTokens = approxTokens(rubricChunk.text);
  const memoryQuarter = usedTokens + Math.floor(tokenBudget / 4);

  for (const { hit, weight } of scoredMemory) {
    const c = renderMemoryHit(hit, weight);
    const cost = approxTokens(c.text);
    if (usedTokens + cost > memoryQuarter) break;
    chunks.push(c);
    usedTokens += cost;
  }

  const symbolQuarter = usedTokens + Math.floor(tokenBudget / 4);
  for (const { hit, weight } of scoredSymbols) {
    const c = renderSymbolHit(hit, weight);
    const cost = approxTokens(c.text);
    if (usedTokens + cost > symbolQuarter) break;
    chunks.push(c);
    usedTokens += cost;
  }

  // Tool catalogue — mandatory; compact if remaining budget is tight.
  const remainingForTools = Math.max(0, tokenBudget - usedTokens);
  const toolText = renderToolCatalog(input.toolCatalog, false);
  const compactToolText = renderToolCatalog(input.toolCatalog, true);
  const toolChunk: BuildContextChunk = {
    source: "tool_catalog",
    weight: mandatoryWeight,
    text:
      approxTokens(toolText) <= remainingForTools ? toolText : compactToolText,
  };
  chunks.push(toolChunk);
  usedTokens += approxTokens(toolChunk.text);

  // Trace summaries — optional.
  if (input.recentTraceSummaries && input.recentTraceSummaries.length > 0) {
    const traceText = renderTraces(input.recentTraceSummaries);
    const traceChunk: BuildContextChunk = {
      source: "trace",
      weight: 0.5,
      text: traceText,
    };
    chunks.push(traceChunk);
    usedTokens += approxTokens(traceChunk.text);
  }

  // Instruction — mandatory AND last.
  const instructionChunk: BuildContextChunk = {
    source: "instruction",
    weight: mandatoryWeight,
    text: renderInstruction(input.taskId, input.taskInstruction),
  };
  chunks.push(instructionChunk);
  usedTokens += approxTokens(instructionChunk.text);

  // 5. Final truncation pass — drop lowest-weight non-mandatory chunks until
  // we fit the budget. Mandatory chunks (rubric + tool_catalog + instruction)
  // carry `mandatoryWeight === +Infinity` and are untouched.
  let finalChunks = chunks;
  if (usedTokens > tokenBudget) {
    const truncatable = chunks
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => c.weight !== mandatoryWeight)
      .sort((a, b) => a.c.weight - b.c.weight); // lowest weight first

    const droppedIdx = new Set<number>();
    for (const { idx } of truncatable) {
      if (usedTokens <= tokenBudget) break;
      droppedIdx.add(idx);
      usedTokens -= approxTokens(chunks[idx].text);
    }
    finalChunks = chunks.filter((_c, i) => !droppedIdx.has(i));
  }

  const systemPrompt = finalChunks.map((c) => c.text).join("\n\n");
  const tokenEstimate = approxTokens(systemPrompt);

  return {
    systemPrompt,
    tokenEstimate,
    chunks: finalChunks,
    meta: {
      memoryHits: memoryHits.length,
      symbolHits: symbolHits.length,
      tokenBudget,
    },
  };
}
