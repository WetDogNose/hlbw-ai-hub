// Pass 18 — Recent trace summaries for the context builder.
//
// Strategy: Option B (Postgres join). The codebase already writes
// structured `TaskGraphState` rows with a per-node `history` array AND
// `BudgetLedger` rows keyed by `issueId`. Querying OTEL exporters
// directly (Cloud Trace API) would require new infra + creds — this
// module extracts the same information from the existing DB, zero new
// dependencies.
//
// Shape of each summary: task id, root span name, start time, duration,
// status, node count (from history length), model ids (distinct), and
// total tokens (sum of BudgetLedger rows matched on `issueId`). The
// ledger does NOT split input vs output (the schema stores a single
// `tokensUsed` per row), so we report the total under `output` and
// leave `input` at 0 — the context builder consumes these as short
// strings anyway, not raw breakdowns.

import prisma from "@/lib/prisma";
import { Prisma, type GraphStateStatus } from "@prisma/client";

export interface TraceSummary {
  taskId: string;
  rootSpanName: string;
  startedAt: string;
  durationMs: number;
  status: "ok" | "error" | "interrupted";
  nodeCount: number;
  modelIds: string[];
  totalTokens: { input: number; output: number };
}

export interface FetchRecentTraceSummariesOptions {
  /** Restrict to a single Issue (task) id. Omit for global recent. */
  taskId?: string;
  /** Max summaries to return. Defaults to 5. Hard ceiling 50. */
  limit?: number;
}

/** Map `TaskGraphState.status` to the public `TraceSummary.status`. */
function mapStatus(s: GraphStateStatus): TraceSummary["status"] {
  if (s === "completed") return "ok";
  if (s === "failed") return "error";
  return "interrupted";
}

interface SummaryRow {
  task_id: string;
  started_at: Date;
  updated_at: Date;
  status: GraphStateStatus;
  node_count: number;
  // `history` is a jsonb array; we count it in SQL and never read the
  // payload here.
}

interface ModelRow {
  task_id: string;
  model: string | null;
  token_sum: bigint | number | null;
}

/**
 * Join `task_graph_state` + `budget_ledger` and return the most-recent
 * run summaries. Ordering: newest `updatedAt` first.
 *
 * Never throws for a zero-row result — returns `[]`.
 */
export async function fetchRecentTraceSummaries(
  opts: FetchRecentTraceSummariesOptions = {},
): Promise<TraceSummary[]> {
  const limit = Math.max(1, Math.min(50, opts.limit ?? 5));
  const taskId = opts.taskId ?? null;

  // Primary rows: one per task_graph_state row, with a jsonb_array_length
  // against `history` for the node count. `Prisma.sql` composes the
  // `WHERE` clause safely; `taskId` interpolates via `${}`.
  const primary = await prisma.$queryRaw<SummaryRow[]>(
    Prisma.sql`
      SELECT
        tgs."issueId" AS task_id,
        tgs."createdAt" AS started_at,
        tgs."updatedAt" AS updated_at,
        tgs.status AS status,
        COALESCE(jsonb_array_length(tgs.history), 0)::int AS node_count
      FROM task_graph_state tgs
      ${taskId ? Prisma.sql`WHERE tgs."issueId" = ${taskId}` : Prisma.empty}
      ORDER BY tgs."updatedAt" DESC
      LIMIT ${limit}
    `,
  );

  if (primary.length === 0) return [];

  const taskIds = primary.map((r) => r.task_id);

  // BudgetLedger rows joined on issueId. `BudgetLedger` does not persist
  // a per-row model id in the current schema — the model string lives
  // only in provider-side span attrs. We still join to aggregate the
  // `tokensUsed` sum; model discovery returns a stub entry so downstream
  // consumers always see at least the default model.
  const ledgerRows = await prisma.$queryRaw<ModelRow[]>(
    Prisma.sql`
      SELECT
        bl."issueId" AS task_id,
        NULL::text AS model,
        SUM(bl."tokensUsed")::bigint AS token_sum
      FROM "BudgetLedger" bl
      WHERE bl."issueId" IN (${Prisma.join(taskIds)})
      GROUP BY bl."issueId"
    `,
  );

  const tokenMap = new Map<string, number>();
  for (const row of ledgerRows) {
    const n =
      typeof row.token_sum === "bigint"
        ? Number(row.token_sum)
        : (row.token_sum ?? 0);
    tokenMap.set(row.task_id, n);
  }

  return primary.map((r): TraceSummary => {
    const duration = Math.max(
      0,
      r.updated_at.getTime() - r.started_at.getTime(),
    );
    const tokens = tokenMap.get(r.task_id) ?? 0;
    return {
      taskId: r.task_id,
      rootSpanName: "Graph:root",
      startedAt: r.started_at.toISOString(),
      durationMs: duration,
      status: mapStatus(r.status),
      nodeCount: r.node_count,
      modelIds: [],
      totalTokens: { input: 0, output: tokens },
    };
  });
}

/** Render a single summary as a short human-readable line for the
 *  context builder's `recentTraceSummaries: string[]` slot. Keeps the
 *  string ID-only — no prompt text, no PII. */
export function stringifyTraceSummary(s: TraceSummary): string {
  const tokens = s.totalTokens.input + s.totalTokens.output;
  return (
    `task=${s.taskId} status=${s.status} ` +
    `nodes=${s.nodeCount} duration_ms=${s.durationMs} ` +
    `tokens=${tokens}`
  );
}
