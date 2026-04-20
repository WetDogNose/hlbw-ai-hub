// Pass 8 — StateGraph runtime types.
//
// The StateGraph is an in-house, typed graph abstraction that drives a task
// forward through discrete `Node`s. Each Node reads a `GraphContext`, does
// work, and returns a `NodeOutcome` describing the next transition. The
// runtime (`StateGraph`) persists every transition atomically to the
// `task_graph_state` Postgres row (see prisma/schema.prisma).
//
// No external LangGraph dependency — decisions.md D1 + pass-01 inventory did
// not surface a concrete need for Python/LangGraph interop.

export type NodeName = string;

// Free-form JSON-serializable state the Nodes read and patch. The runtime
// never introspects the shape; it stores whatever each Node produces.
export interface GraphContext {
  [k: string]: unknown;
}

// One entry in the append-only `history` log. Written by the runtime after
// every transition, regardless of outcome.
export interface HistoryEntry {
  node: NodeName;
  enteredAt: string; // ISO-8601
  exitedAt: string; // ISO-8601
  outcome: "ok" | "error" | "interrupt";
  detail?: string;
}

// Node return value. Drives the next state transition.
export type NodeOutcome =
  | { kind: "goto"; next: NodeName; contextPatch?: Partial<GraphContext> }
  | { kind: "interrupt"; reason: string; contextPatch?: Partial<GraphContext> }
  | { kind: "complete"; contextPatch?: Partial<GraphContext> }
  | { kind: "error"; error: Error; contextPatch?: Partial<GraphContext> };

// A single node: a named async function from context to outcome.
export interface Node {
  name: NodeName;
  run: (ctx: GraphContext) => Promise<NodeOutcome>;
}

// Graph definition handed to `StateGraph`. The runtime loads
// `nodes[currentNode]` on each `transition()` call.
export interface GraphDefinition {
  startNode: NodeName;
  nodes: Record<NodeName, Node>;
}
