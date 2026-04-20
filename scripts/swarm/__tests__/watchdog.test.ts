// Pass 10 — watchdog unit tests.
//
// Fixture: three task_graph_state rows:
//   - running, fresh (lastTransitionAt = now) — must NOT be interrupted
//   - running, stale (older than SWARM_POLICY.workerTimeoutMinutes) — MUST
//     be interrupted
//   - paused (any age) — must NOT be touched (watchdog only acts on
//     `running` rows)
//
// We stub `@/lib/prisma` so the watchdog's `findMany` and Issue update
// calls return from in-memory fixtures, and stub
// `@/lib/orchestration/graph` so the constructed interrupt-graph's
// `.interrupt()` call just flips the fixture row's status.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { SWARM_POLICY } from "../policy";

interface GraphRow {
  issueId: string;
  currentNode: string;
  status: "running" | "paused" | "interrupted" | "completed" | "failed";
  lastTransitionAt: Date;
  interruptReason?: string | null;
}

const fixture: {
  rows: GraphRow[];
  issueUpdates: { id: string; status: string }[];
} = { rows: [], issueUpdates: [] };

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    taskGraphState: {
      findMany: async (args: {
        where: {
          status: string;
          lastTransitionAt: { lt: Date };
        };
      }) => {
        const { status, lastTransitionAt } = args.where;
        return fixture.rows
          .filter((r) => r.status === status)
          .filter(
            (r) => r.lastTransitionAt.getTime() < lastTransitionAt.lt.getTime(),
          )
          .map((r) => ({
            issueId: r.issueId,
            currentNode: r.currentNode,
            lastTransitionAt: r.lastTransitionAt,
          }));
      },
    },
    issue: {
      update: async (args: {
        where: { id: string };
        data: { status: string };
      }) => {
        fixture.issueUpdates.push({
          id: args.where.id,
          status: args.data.status,
        });
        return { id: args.where.id };
      },
    },
  },
}));

const interruptMock = jest.fn(
  async (issueId: string, reason: string): Promise<void> => {
    const row = fixture.rows.find((r) => r.issueId === issueId);
    if (row) {
      row.status = "interrupted";
      row.interruptReason = reason;
    }
  },
);

jest.mock("@/lib/orchestration/graph", () => ({
  __esModule: true,
  StateGraph: class {
    async interrupt(id: string, reason: string) {
      return interruptMock(id, reason);
    }
  },
  defineGraph: () => ({
    async interrupt(id: string, reason: string) {
      return interruptMock(id, reason);
    },
  }),
}));

jest.mock("../tracing", () => ({
  __esModule: true,
  getTracer: () => ({
    startActiveSpan: async <T>(
      _name: string,
      fn: (span: { setAttribute: () => void; end: () => void }) => Promise<T>,
    ): Promise<T> => {
      return fn({ setAttribute: () => {}, end: () => {} });
    },
  }),
  startTracing: () => {},
  stopTracing: async () => {},
}));

jest.mock("../audit", () => ({
  __esModule: true,
  appendAudit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock("../shared-memory", () => ({
  __esModule: true,
  closeMemoryClient: jest
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined),
}));

// Stub out child_process.spawnSync so the docker-kill path is a no-op
// with a success exit code.
jest.mock("node:child_process", () => ({
  __esModule: true,
  spawnSync: () => ({ status: 0, stdout: "", stderr: "" }),
}));

import { runWatchdog, WATCHDOG_TIMEOUT_REASON } from "../watchdog";

beforeEach(() => {
  interruptMock.mockClear();
  fixture.rows = [];
  fixture.issueUpdates = [];
});

describe("watchdog", () => {
  it("interrupts only the stale running row", async () => {
    const now = Date.now();
    const timeoutMs = SWARM_POLICY.workerTimeoutMinutes * 60 * 1000;

    fixture.rows = [
      {
        issueId: "issue-fresh",
        currentNode: "execute_step",
        status: "running",
        lastTransitionAt: new Date(now - 5 * 60 * 1000), // 5 min ago — fresh
      },
      {
        issueId: "issue-stale",
        currentNode: "execute_step",
        status: "running",
        lastTransitionAt: new Date(now - (timeoutMs + 10 * 60 * 1000)),
      },
      {
        issueId: "issue-paused",
        currentNode: "propose_plan",
        status: "paused",
        lastTransitionAt: new Date(now - 60 * 60 * 1000),
      },
    ];

    const result = await runWatchdog();

    expect(result).toHaveLength(1);
    expect(result[0].issueId).toBe("issue-stale");
    expect(result[0].currentNode).toBe("execute_step");
    expect(interruptMock).toHaveBeenCalledTimes(1);
    expect(interruptMock).toHaveBeenCalledWith(
      "issue-stale",
      expect.stringContaining(WATCHDOG_TIMEOUT_REASON),
    );

    // Fresh row untouched.
    expect(fixture.rows.find((r) => r.issueId === "issue-fresh")?.status).toBe(
      "running",
    );
    // Paused row untouched.
    expect(fixture.rows.find((r) => r.issueId === "issue-paused")?.status).toBe(
      "paused",
    );
    // Stale row flipped to interrupted.
    expect(fixture.rows.find((r) => r.issueId === "issue-stale")?.status).toBe(
      "interrupted",
    );
    // Parent Issue flipped back to pending.
    expect(fixture.issueUpdates).toEqual([
      { id: "issue-stale", status: "pending" },
    ]);
  });

  it("is a no-op when no rows are stale", async () => {
    const now = Date.now();
    fixture.rows = [
      {
        issueId: "issue-a",
        currentNode: "execute_step",
        status: "running",
        lastTransitionAt: new Date(now - 60 * 1000),
      },
    ];
    const result = await runWatchdog();
    expect(result).toHaveLength(0);
    expect(interruptMock).not.toHaveBeenCalled();
    expect(fixture.issueUpdates).toEqual([]);
  });

  it("tolerates a mix of zero stale and zero paused rows without error", async () => {
    fixture.rows = [];
    const result = await runWatchdog();
    expect(result).toEqual([]);
    expect(interruptMock).not.toHaveBeenCalled();
  });
});
