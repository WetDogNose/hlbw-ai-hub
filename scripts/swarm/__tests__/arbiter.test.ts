import { describe, expect, it, jest, beforeEach } from "@jest/globals";

// Pass 5: arbiter now queries Postgres via `@/lib/prisma` using
// $transaction + $queryRaw. We stub the client so the existing scenarios
// (no tasks, blocked deps, priority ordering, createdAt tiebreak) remain
// applicable without a live DB.

type IssueRow = {
  id: string;
  title: string | null;
  instruction: string;
  status: string;
  priority: number;
  dependencies: string[];
  blockedBy: string[];
  agentCategory: string | null;
  isolationId: string | null;
  assignedAgentLabel: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  metadata: unknown;
  threadId: string;
  assignedAgentId: string | null;
  goalId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// Mutable fixture the mocked prisma reads from, plus the simulation of the
// arbiter's SELECT ... FOR UPDATE SKIP LOCKED query against it.
const fixture: { rows: IssueRow[] } = { rows: [] };

function pickCandidate(): IssueRow | null {
  const completed = new Set(
    fixture.rows.filter((r) => r.status === "completed").map((r) => r.id),
  );
  const runnable = fixture.rows
    .filter((r) => r.status === "pending")
    .filter((r) => r.blockedBy.length === 0)
    .filter((r) => r.dependencies.every((d) => completed.has(d)));
  runnable.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return runnable[0] ?? null;
}

jest.mock("@/lib/prisma", () => {
  const client = {
    $transaction: async (fn: any) =>
      fn({
        $queryRaw: async (strings: TemplateStringsArray, ..._values: any[]) => {
          const sql = strings.join(" ");
          if (sql.includes("SELECT *") && sql.includes('FROM "Issue"')) {
            const row = pickCandidate();
            return row ? [row] : [];
          }
          if (sql.includes('UPDATE "Issue"')) {
            // arbiter.ts interpolates two values: the new status, then the id.
            const newStatus = _values[0] as string;
            const id = _values[1] as string;
            const target = fixture.rows.find((r) => r.id === id);
            if (!target) return [];
            target.status = newStatus;
            target.startedAt = new Date();
            return [target];
          }
          return [];
        },
      }),
  };
  return { __esModule: true, default: client };
});

import { getNextAvailableTask } from "../arbiter";

function row(partial: Partial<IssueRow>): IssueRow {
  return {
    id: "r",
    title: "row",
    instruction: "row",
    status: "pending",
    priority: 5,
    dependencies: [],
    blockedBy: [],
    agentCategory: null,
    isolationId: null,
    assignedAgentLabel: null,
    startedAt: null,
    completedAt: null,
    metadata: {},
    threadId: "t1",
    assignedAgentId: null,
    goalId: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    ...partial,
  };
}

describe("getNextAvailableTask", () => {
  beforeEach(() => {
    fixture.rows = [];
  });

  it("returns null if there are no tasks", async () => {
    const task = await getNextAvailableTask();
    expect(task).toBeNull();
  });

  it("returns null if all pending tasks are blocked by incomplete dependencies", async () => {
    fixture.rows = [
      row({ id: "1", title: "dep", status: "in_progress" }),
      row({ id: "2", title: "task", dependencies: ["1"] }),
    ];
    const task = await getNextAvailableTask();
    expect(task).toBeNull();
  });

  it("selects the highest priority task that has its dependencies met", async () => {
    fixture.rows = [
      row({ id: "t1", title: "low prio", priority: 1 }),
      row({ id: "t2", title: "high prio", priority: 5 }),
    ];
    const task = await getNextAvailableTask();
    expect(task?.id).toBe("t2");
  });

  it("respects creation time if priorities are equal", async () => {
    fixture.rows = [
      row({
        id: "t1",
        title: "new task",
        priority: 3,
        createdAt: new Date("2025-01-02T00:00:00Z"),
      }),
      row({
        id: "t2",
        title: "old task",
        priority: 3,
        createdAt: new Date("2025-01-01T00:00:00Z"),
      }),
    ];
    const task = await getNextAvailableTask();
    expect(task?.id).toBe("t2");
  });
});
