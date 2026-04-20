// Pass 16 — /api/scion/state unit tests.
//
// Mocks `@/lib/prisma` so no DB is required. Verifies the response shape,
// the pagination cursor, and the worker-counts aggregation.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

type IssueRow = {
  id: string;
  title: string | null;
  instruction: string;
  status: string;
  priority: number;
  dependencies: string[];
  blockedBy: string[];
  agentCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  threadId: string;
  graphState: {
    currentNode: string;
    status: string;
    interruptReason: string | null;
    lastTransitionAt: Date;
  } | null;
};

const issueFindMany = jest.fn<(args: unknown) => Promise<IssueRow[]>>();
const budgetAggregate =
  jest.fn<() => Promise<{ _sum: { tokensUsed: number | null } }>>();
const graphGroupBy =
  jest.fn<() => Promise<Array<{ status: string; _count: { _all: number } }>>>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    issue: {
      findMany: (args: unknown) =>
        (issueFindMany as unknown as (a: unknown) => Promise<IssueRow[]>)(args),
    },
    budgetLedger: {
      aggregate: () =>
        (
          budgetAggregate as unknown as () => Promise<{
            _sum: { tokensUsed: number | null };
          }>
        )(),
    },
    taskGraphState: {
      groupBy: () =>
        (
          graphGroupBy as unknown as () => Promise<
            Array<{ status: string; _count: { _all: number } }>
          >
        )(),
    },
  },
}));

import { GET } from "../route";

function mkIssue(overrides: Partial<IssueRow>): IssueRow {
  const now = new Date("2026-04-19T00:00:00Z");
  return {
    id: "i-1",
    title: "T",
    instruction: "do work",
    status: "pending",
    priority: 5,
    dependencies: [],
    blockedBy: [],
    agentCategory: "default",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    threadId: "t-1",
    graphState: null,
    ...overrides,
  };
}

function req(url: string = "http://localhost/api/scion/state"): Request {
  return new Request(url, { method: "GET" });
}

describe("GET /api/scion/state", () => {
  beforeEach(() => {
    issueFindMany.mockReset();
    budgetAggregate.mockReset();
    graphGroupBy.mockReset();
  });

  it("returns issues, ledgerTotal, and workerCounts", async () => {
    issueFindMany.mockResolvedValue([
      mkIssue({ id: "i-1" }),
      mkIssue({
        id: "i-2",
        status: "in_progress",
        graphState: {
          currentNode: "execute_step",
          status: "running",
          interruptReason: null,
          lastTransitionAt: new Date("2026-04-19T00:05:00Z"),
        },
      }),
    ]);
    budgetAggregate.mockResolvedValue({ _sum: { tokensUsed: 12345 } });
    graphGroupBy.mockResolvedValue([
      { status: "running", _count: { _all: 1 } },
      { status: "completed", _count: { _all: 2 } },
    ]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues).toHaveLength(2);
    expect(body.issues[0].id).toBe("i-1");
    expect(body.issues[1].graphState.currentNode).toBe("execute_step");
    expect(body.ledgerTotal).toBe(12345);
    expect(body.workerCounts).toEqual({
      running: 1,
      paused: 0,
      interrupted: 0,
      completed: 2,
      failed: 0,
    });
    expect(body.nextCursor).toBeNull();
  });

  it("returns nextCursor when more rows exist", async () => {
    const rows: IssueRow[] = [];
    for (let i = 0; i < 51; i++) rows.push(mkIssue({ id: `i-${i}` }));
    issueFindMany.mockResolvedValue(rows);
    budgetAggregate.mockResolvedValue({ _sum: { tokensUsed: 0 } });
    graphGroupBy.mockResolvedValue([]);

    const res = await GET(req("http://localhost/api/scion/state?limit=50"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issues).toHaveLength(50);
    expect(body.nextCursor).toBe("i-49");
  });

  it("treats null ledger sum as 0", async () => {
    issueFindMany.mockResolvedValue([]);
    budgetAggregate.mockResolvedValue({ _sum: { tokensUsed: null } });
    graphGroupBy.mockResolvedValue([]);

    const res = await GET(req());
    const body = await res.json();
    expect(body.ledgerTotal).toBe(0);
  });

  it("returns 500 when Prisma throws", async () => {
    issueFindMany.mockRejectedValue(new Error("db down"));
    budgetAggregate.mockResolvedValue({ _sum: { tokensUsed: 0 } });
    graphGroupBy.mockResolvedValue([]);

    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/db down/);
  });
});
