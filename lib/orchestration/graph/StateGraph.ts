// Pass 8 — StateGraph runtime (in-house, Postgres-backed).
//
// Atomic contract: every mutation is wrapped in `prisma.$transaction`. The
// transaction takes a `SELECT ... FOR UPDATE` row lock on the
// `task_graph_state` row, runs the current node, applies the resulting
// context patch, appends a HistoryEntry, updates `currentNode`/`status`,
// and commits. Concurrent `transition()` calls on the same issue therefore
// serialize at the database level — the second caller observes the first
// caller's updated row.
//
// Every mutation goes through $transaction with FOR UPDATE. No naked
// `prisma.taskGraphState.update` in the hot path.

import { Prisma } from "@prisma/client";
import type { GraphStateStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getOrchestratorTracer } from "@/lib/orchestration/tracing/tracer";
import { SPAN_ATTR, SPAN_ROLE } from "@/lib/orchestration/tracing/attrs";
// Pass 19 — Turn-PPO seam. `recordTurn` fires after each transition (success
// or error) inside a try/catch so a broken TurnCritic never breaks the graph.
import { getTurnCritic, hashState } from "@/lib/rl";
import type { TurnSnapshot } from "@/lib/rl";
import type {
  GraphContext,
  GraphDefinition,
  HistoryEntry,
  NodeName,
  NodeOutcome,
} from "./types";

// Row shape inferred directly from the generated Prisma client. Do NOT
// redeclare a hand-rolled row type — this keeps us honest if the schema
// evolves.
export type TaskGraphStateRow = Prisma.TaskGraphStateGetPayload<object>;

// Local tx type alias matches what `prisma.$transaction(async (tx) => ...)`
// hands to its callback. Using `Prisma.TransactionClient` keeps us in lock-
// step with the generated client and avoids `any`.
type Tx = Prisma.TransactionClient;

function nowIso(): string {
  return new Date().toISOString();
}

function readHistory(raw: Prisma.JsonValue): HistoryEntry[] {
  // The column defaults to `[]`, but we treat a missing/wrong-shape value as
  // an empty log rather than crashing the runtime.
  if (!Array.isArray(raw)) return [];
  return raw as unknown as HistoryEntry[];
}

function readContext(raw: Prisma.JsonValue): GraphContext {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as unknown as GraphContext;
}

/**
 * Acquire a row-level `FOR UPDATE` lock on `task_graph_state` for the given
 * issueId inside the current transaction. The subsequent $queryRaw / update
 * calls in the same transaction see the locked row; any parallel transaction
 * blocks here until we commit.
 *
 * Returns the locked row, or `null` if no row exists for this issue.
 */
async function lockRowForUpdate(
  tx: Tx,
  issueId: string,
): Promise<TaskGraphStateRow | null> {
  const rows = await tx.$queryRaw<TaskGraphStateRow[]>(
    Prisma.sql`
      SELECT *
      FROM "task_graph_state"
      WHERE "issueId" = ${issueId}
      FOR UPDATE
    `,
  );
  if (rows.length === 0) return null;
  return rows[0];
}

export class StateGraph {
  constructor(private readonly definition: GraphDefinition) {
    if (!definition.nodes[definition.startNode]) {
      throw new Error(
        `StateGraph: startNode "${definition.startNode}" not present in nodes map`,
      );
    }
  }

  /**
   * Create a fresh `task_graph_state` row for this Issue, pointing at
   * `definition.startNode` with status=`running`. Throws if a row for the
   * Issue already exists.
   */
  async start(
    issueId: string,
    initialContext: GraphContext = {},
  ): Promise<TaskGraphStateRow> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.taskGraphState.findUnique({
        where: { issueId },
      });
      if (existing) {
        throw new Error(
          `StateGraph.start: task_graph_state row already exists for issueId=${issueId}`,
        );
      }
      const created = await tx.taskGraphState.create({
        data: {
          issueId,
          currentNode: this.definition.startNode,
          status: "running",
          context: initialContext as Prisma.InputJsonValue,
          history: [] as Prisma.InputJsonValue,
          lastTransitionAt: new Date(),
        },
      });
      return created;
    });
  }

  /**
   * Load a row. Public read path; does not mutate.
   */
  async get(issueId: string): Promise<TaskGraphStateRow | null> {
    const row = await prisma.taskGraphState.findUnique({
      where: { issueId },
    });
    return row;
  }

  /**
   * Run one step of the graph atomically:
   *   - Acquire FOR UPDATE lock on the row.
   *   - Refuse if status !== 'running' (caller must `resume()` first).
   *   - Execute `nodes[currentNode].run(ctx)`.
   *   - Apply contextPatch, append HistoryEntry, update status/currentNode.
   *   - Commit.
   */
  async transition(
    issueId: string,
  ): Promise<{ stateAfter: TaskGraphStateRow; outcome: NodeOutcome }> {
    // Pass 18 — wrap the whole transition in an OTEL span. The span name is
    // finalised once we know the currentNode ("Graph:<node>") via
    // `updateName`. Attributes: task id, current node, agent category (when
    // present in context), and — after the node runs — the outcome kind.
    // The span ends in BOTH success and error paths via the try/finally.
    const tracer = getOrchestratorTracer();
    // Pass 19 — capture start timing up front so `durationMs` on the turn
    // snapshot reflects the whole transition, including the $transaction.
    const transitionStartedAt = Date.now();
    const transitionStartedIso = new Date(transitionStartedAt).toISOString();
    // Populated inside the transaction; read back outside to build the snap.
    let snapNodeName: string = "unknown";
    let snapModelId: string = "unknown";
    let snapStateHash: string = hashState({ issueId });
    return tracer.startActiveSpan("Graph:transition", async (span) => {
      let result: {
        stateAfter: TaskGraphStateRow;
        outcome: NodeOutcome;
      } | null = null;
      let threw: unknown = null;
      try {
        result = await prisma.$transaction(async (tx) => {
          const row = await lockRowForUpdate(tx, issueId);
          if (!row) {
            throw new Error(
              `StateGraph.transition: no task_graph_state row for issueId=${issueId}`,
            );
          }
          if (row.status !== "running") {
            throw new Error(
              `StateGraph.transition: cannot transition from status=${row.status}; call resume() first`,
            );
          }
          const node = this.definition.nodes[row.currentNode];
          if (!node) {
            throw new Error(
              `StateGraph.transition: node "${row.currentNode}" not defined in graph`,
            );
          }

          // Attach the standardized attrs now that we know the node.
          span.updateName(`Graph:${row.currentNode}`);
          span.setAttribute(SPAN_ATTR.TASK_ID, issueId);
          span.setAttribute(SPAN_ATTR.NODE, row.currentNode);
          const ctxSnapshot = readContext(row.context);
          const agentCategory = ctxSnapshot.agentCategory;
          if (typeof agentCategory === "string" && agentCategory.length > 0) {
            span.setAttribute(SPAN_ATTR.AGENT_CATEGORY, agentCategory);
          }

          // Pass 19 — populate snapshot fields from the authoritative
          // context snapshot. `stateHash` is 16-char SHA-256 over the
          // context; not cryptographically sensitive.
          snapNodeName = row.currentNode;
          const ctxModelId = ctxSnapshot.modelId;
          if (typeof ctxModelId === "string" && ctxModelId.length > 0) {
            snapModelId = ctxModelId;
          }
          snapStateHash = hashState(ctxSnapshot);

          const enteredAt = nowIso();
          const ctx = ctxSnapshot;
          const history = readHistory(row.history);

          let outcome: NodeOutcome;
          try {
            outcome = await node.run(ctx);
          } catch (err) {
            // A thrown error is coerced into the "error" outcome so the
            // runtime always records a HistoryEntry and transitions to
            // status=failed.
            outcome = {
              kind: "error",
              error: err instanceof Error ? err : new Error(String(err)),
            };
          }

          // Record outcome on the span before we mutate state. The
          // attribute value is the `kind` literal, matching
          // SPAN_ATTR.NODE_OUTCOME's documented domain.
          span.setAttribute(SPAN_ATTR.NODE_OUTCOME, outcome.kind);
          if (outcome.kind === "error") {
            span.recordException(outcome.error);
          }

          const exitedAt = nowIso();
          const patchedContext: GraphContext = {
            ...ctx,
            ...(outcome.contextPatch ?? {}),
          };

          let nextStatus: GraphStateStatus = row.status;
          let nextNode: NodeName = row.currentNode;
          let nextInterruptReason: string | null = row.interruptReason;
          const entry: HistoryEntry = {
            node: row.currentNode,
            enteredAt,
            exitedAt,
            outcome: "ok",
          };

          switch (outcome.kind) {
            case "goto": {
              if (!this.definition.nodes[outcome.next]) {
                throw new Error(
                  `StateGraph.transition: node "${row.currentNode}" returned goto "${outcome.next}" which is not defined`,
                );
              }
              nextNode = outcome.next;
              nextStatus = "running";
              nextInterruptReason = null;
              entry.outcome = "ok";
              entry.detail = `-> ${outcome.next}`;
              break;
            }
            case "interrupt": {
              nextStatus = "interrupted";
              nextInterruptReason = outcome.reason;
              entry.outcome = "interrupt";
              entry.detail = outcome.reason;
              break;
            }
            case "complete": {
              nextStatus = "completed";
              nextInterruptReason = null;
              entry.outcome = "ok";
              entry.detail = "complete";
              break;
            }
            case "error": {
              nextStatus = "failed";
              nextInterruptReason = null;
              entry.outcome = "error";
              entry.detail = outcome.error.message;
              break;
            }
          }

          const nextHistory: HistoryEntry[] = [...history, entry];

          const stateAfter = await tx.taskGraphState.update({
            where: { issueId },
            data: {
              currentNode: nextNode,
              status: nextStatus,
              context: patchedContext as Prisma.InputJsonValue,
              history: nextHistory as unknown as Prisma.InputJsonValue,
              interruptReason: nextInterruptReason,
              lastTransitionAt: new Date(),
            },
          });

          return { stateAfter, outcome };
        });
      } catch (err) {
        threw = err;
        span.recordException(err as Error);
      } finally {
        span.end();
      }

      // Pass 19 — fire the turn snapshot AFTER the transaction settles, so
      // a failing TurnCritic write cannot roll back state. Wrapped in its
      // own try/catch — RL writes MUST NOT surface into orchestration.
      const durationMs = Date.now() - transitionStartedAt;
      const snapOutcome: TurnSnapshot["outcome"] = result
        ? result.outcome.kind === "interrupt"
          ? "interrupt"
          : result.outcome.kind === "error"
            ? "error"
            : "ok"
        : "error";
      const actionKind = result?.outcome.kind ?? "error";
      const actionSummary =
        result?.outcome.kind === "goto"
          ? `goto:${result.outcome.next}`
          : result?.outcome.kind === "error"
            ? `error:${result.outcome.error.message}`
            : actionKind;
      const snap: TurnSnapshot = {
        taskId: issueId,
        issueId,
        node: snapNodeName,
        role: SPAN_ROLE.ORCHESTRATOR,
        stateHash: snapStateHash,
        action: { kind: actionKind, summary: actionSummary },
        outcome: snapOutcome,
        durationMs,
        modelId: snapModelId,
        timestamp: transitionStartedIso,
      };
      await tracer.startActiveSpan("RL:recordTurn", async (recordSpan) => {
        recordSpan.setAttribute(SPAN_ATTR.TASK_ID, snap.taskId);
        recordSpan.setAttribute(SPAN_ATTR.ROLE, SPAN_ROLE.ORCHESTRATOR);
        recordSpan.setAttribute(SPAN_ATTR.NODE, snap.node);
        try {
          await getTurnCritic().recordTurn(snap);
        } catch (err) {
          recordSpan.recordException(err as Error);
        } finally {
          recordSpan.end();
        }
      });

      if (threw) throw threw;
      if (!result) {
        // Should be unreachable — threw would be set.
        throw new Error(
          "StateGraph.transition: internal error — no result and no thrown exception",
        );
      }
      return result;
    });
  }

  /**
   * Flip an `interrupted` or `paused` row back to `running` so the next
   * `transition()` call can proceed. Does NOT execute a node.
   */
  async resume(issueId: string): Promise<TaskGraphStateRow> {
    return prisma.$transaction(async (tx) => {
      const row = await lockRowForUpdate(tx, issueId);
      if (!row) {
        throw new Error(
          `StateGraph.resume: no task_graph_state row for issueId=${issueId}`,
        );
      }
      if (row.status !== "interrupted" && row.status !== "paused") {
        throw new Error(
          `StateGraph.resume: cannot resume from status=${row.status}`,
        );
      }
      const updated = await tx.taskGraphState.update({
        where: { issueId },
        data: {
          status: "running",
          interruptReason: null,
          lastTransitionAt: new Date(),
        },
      });
      return updated;
    });
  }

  /**
   * Manually mark a row as `interrupted` with the given reason. Used when an
   * external signal (e.g., watchdog, human review queue) needs to pause the
   * graph outside of a Node's control.
   */
  async interrupt(issueId: string, reason: string): Promise<TaskGraphStateRow> {
    return prisma.$transaction(async (tx) => {
      const row = await lockRowForUpdate(tx, issueId);
      if (!row) {
        throw new Error(
          `StateGraph.interrupt: no task_graph_state row for issueId=${issueId}`,
        );
      }
      const updated = await tx.taskGraphState.update({
        where: { issueId },
        data: {
          status: "interrupted",
          interruptReason: reason,
          lastTransitionAt: new Date(),
        },
      });
      return updated;
    });
  }
}
