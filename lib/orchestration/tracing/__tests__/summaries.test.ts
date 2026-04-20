// Pass 18 — `fetchRecentTraceSummaries` unit tests.
//
// Mocks `@/lib/prisma` so no DB is required. The module under test runs
// two `$queryRaw` calls — primary (task_graph_state) and ledger
// (BudgetLedger). The mock routes the two queries by a cheap SQL-text
// sniff: the first query's Prisma.sql contains "task_graph_state",
// the second contains "BudgetLedger".

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

type PrimaryRow = {
  task_id: string;
  started_at: Date;
  updated_at: Date;
  status: "completed" | "failed" | "running" | "paused" | "interrupted";
  node_count: number;
};

type LedgerRow = {
  task_id: string;
  model: string | null;
  token_sum: number;
};

const primaryRows: PrimaryRow[] = [];
const ledgerRows: LedgerRow[] = [];

const queryRaw = jest.fn(async (query: unknown): Promise<unknown[]> => {
  const text =
    query &&
    typeof query === "object" &&
    "strings" in (query as Record<string, unknown>)
      ? (query as { strings: readonly string[] }).strings.join(" ")
      : JSON.stringify(query);
  if (text.includes("task_graph_state")) return primaryRows;
  if (text.includes("BudgetLedger")) return ledgerRows;
  return [];
});

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    $queryRaw: (q: unknown) =>
      (queryRaw as unknown as (q: unknown) => Promise<unknown[]>)(q),
  },
}));

import { fetchRecentTraceSummaries, stringifyTraceSummary } from "../summaries";

beforeEach(() => {
  primaryRows.length = 0;
  ledgerRows.length = 0;
  queryRaw.mockClear();
});

describe("fetchRecentTraceSummaries", () => {
  it("joins TaskGraphState + BudgetLedger and returns summaries with correct durations + tokens", async () => {
    primaryRows.push(
      {
        task_id: "issue-a",
        started_at: new Date("2026-04-19T00:00:00Z"),
        updated_at: new Date("2026-04-19T00:00:10Z"),
        status: "completed",
        node_count: 3,
      },
      {
        task_id: "issue-b",
        started_at: new Date("2026-04-19T01:00:00Z"),
        updated_at: new Date("2026-04-19T01:00:05Z"),
        status: "failed",
        node_count: 1,
      },
    );
    ledgerRows.push(
      { task_id: "issue-a", model: null, token_sum: 500 },
      { task_id: "issue-b", model: null, token_sum: 120 },
    );

    const out = await fetchRecentTraceSummaries({ limit: 5 });
    expect(out).toHaveLength(2);

    const a = out.find((s) => s.taskId === "issue-a")!;
    expect(a.status).toBe("ok");
    expect(a.nodeCount).toBe(3);
    expect(a.durationMs).toBe(10_000);
    expect(a.totalTokens.output).toBe(500);
    expect(a.rootSpanName).toBe("Graph:root");
    expect(a.startedAt).toBe("2026-04-19T00:00:00.000Z");

    const b = out.find((s) => s.taskId === "issue-b")!;
    expect(b.status).toBe("error");
    expect(b.durationMs).toBe(5_000);
    expect(b.totalTokens.output).toBe(120);
  });

  it("returns an empty array when no task_graph_state rows exist", async () => {
    // primaryRows stays empty.
    const out = await fetchRecentTraceSummaries({ limit: 10 });
    expect(out).toEqual([]);
    // Ledger query should be skipped on zero primary rows.
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('handles interrupted status as "interrupted"', async () => {
    primaryRows.push({
      task_id: "issue-c",
      started_at: new Date("2026-04-19T02:00:00Z"),
      updated_at: new Date("2026-04-19T02:00:02Z"),
      status: "interrupted",
      node_count: 2,
    });
    const out = await fetchRecentTraceSummaries();
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("interrupted");
  });

  it("treats a missing ledger row as zero tokens", async () => {
    primaryRows.push({
      task_id: "issue-d",
      started_at: new Date("2026-04-19T03:00:00Z"),
      updated_at: new Date("2026-04-19T03:00:01Z"),
      status: "completed",
      node_count: 1,
    });
    // ledgerRows stays empty.
    const out = await fetchRecentTraceSummaries();
    expect(out[0].totalTokens.output).toBe(0);
  });
});

describe("stringifyTraceSummary", () => {
  it("produces an ID-only one-line summary with no prompt text", () => {
    const line = stringifyTraceSummary({
      taskId: "issue-x",
      rootSpanName: "Graph:root",
      startedAt: "2026-04-19T00:00:00.000Z",
      durationMs: 1234,
      status: "ok",
      nodeCount: 4,
      modelIds: [],
      totalTokens: { input: 0, output: 99 },
    });
    expect(line).toBe(
      "task=issue-x status=ok nodes=4 duration_ms=1234 tokens=99",
    );
  });
});
