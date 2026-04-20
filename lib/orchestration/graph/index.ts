// Pass 8 — Barrel export for the StateGraph runtime.
//
// Public API:
//   - `StateGraph` class (Postgres-backed)
//   - `defineGraph(definition)` helper
//   - Types from `./types` (NodeName, Node, GraphContext, GraphDefinition,
//     NodeOutcome, HistoryEntry)
//   - `TaskGraphStateRow` row shape (inferred from generated Prisma client)

import { StateGraph } from "./StateGraph";
import type { GraphDefinition } from "./types";

export { StateGraph } from "./StateGraph";
export type { TaskGraphStateRow } from "./StateGraph";
export type {
  GraphContext,
  GraphDefinition,
  HistoryEntry,
  Node,
  NodeName,
  NodeOutcome,
} from "./types";

/**
 * Tiny helper so callers can write
 *   `const graph = defineGraph({ startNode: "a", nodes: { ... } });`
 * instead of `new StateGraph(...)` at the call site.
 */
export function defineGraph(definition: GraphDefinition): StateGraph {
  return new StateGraph(definition);
}
