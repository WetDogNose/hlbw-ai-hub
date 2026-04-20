// Pass 6 — dispatcher integration test.
//
// Gated on DB_TEST=1. Without the flag it `describe.skip`s cleanly so the
// standard test gate stays fast and DB-free.
//
// Prereqs when DB_TEST=1:
//   1. `cloud-sql-proxy` running against the project Cloud SQL instance.
//   2. `npx prisma migrate deploy` applied to that target.
//
// Body:
//   - Seed two pending Issues under a fresh Thread.
//   - Mock `spawnWorkerSubprocess` so no real tsx/Docker work happens.
//   - Call `dispatchReadyIssues(10)` — expect exactly two spawns, both
//     Issues now `in_progress`.
//   - Clean up seeded rows.

import {
  describe,
  expect,
  it,
  beforeAll,
  afterAll,
  afterEach,
  jest,
} from "@jest/globals";

// Replace the real subprocess spawner with a deterministic stub BEFORE the
// dispatcher module is imported. The module exports both functions from the
// same file, so `jest.mock` with a factory replaces them for the whole suite.
jest.mock("@/lib/orchestration/dispatcher", () => {
  const actual = jest.requireActual<
    typeof import("@/lib/orchestration/dispatcher")
  >("@/lib/orchestration/dispatcher");
  return {
    __esModule: true,
    ...actual,
    spawnWorkerSubprocess: async (taskId: string) => ({
      workerId: `mock-worker-${taskId}`,
    }),
  };
});

import prisma from "@/lib/prisma";
import {
  dispatchReadyIssues,
  reclaimStaleWorkers,
} from "@/lib/orchestration/dispatcher";
import { TaskStatus } from "../types";

const DB_TEST_ENABLED = process.env.DB_TEST === "1";
const describeOrSkip = DB_TEST_ENABLED ? describe : describe.skip;

describeOrSkip("dispatcher (DB_TEST=1)", () => {
  let threadId: string;
  const createdIssueIds: string[] = [];

  beforeAll(async () => {
    const thread = await prisma.thread.create({
      data: { title: "dispatcher-integration-test" },
    });
    threadId = thread.id;
  });

  afterEach(async () => {
    if (createdIssueIds.length) {
      await prisma.issue.deleteMany({
        where: { id: { in: createdIssueIds } },
      });
      createdIssueIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.thread.delete({ where: { id: threadId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('claims and "spawns" two pending Issues in one dispatch pass', async () => {
    const a = await prisma.issue.create({
      data: {
        title: "dispatch-a",
        instruction: "first",
        status: TaskStatus.Pending,
        priority: 5,
        thread: { connect: { id: threadId } },
      },
    });
    const b = await prisma.issue.create({
      data: {
        title: "dispatch-b",
        instruction: "second",
        status: TaskStatus.Pending,
        priority: 5,
        thread: { connect: { id: threadId } },
      },
    });
    createdIssueIds.push(a.id, b.id);

    const results = await dispatchReadyIssues(10);

    expect(results.length).toBe(2);
    const ids = results.map((r) => r.taskId).sort();
    expect(ids).toEqual([a.id, b.id].sort());
    for (const r of results) {
      expect(r.status).toBe("spawned");
      expect(r.workerId).toMatch(/^mock-worker-/);
    }

    const rows = await prisma.issue.findMany({
      where: { id: { in: [a.id, b.id] } },
    });
    for (const row of rows) {
      expect(row.status).toBe(TaskStatus.InProgress);
      expect(row.startedAt).not.toBeNull();
    }
  });

  it("reclaimStaleWorkers reverts long-running Issues to pending", async () => {
    const ancient = new Date(Date.now() - 60 * 60 * 1000); // 60 min ago
    const stuck = await prisma.issue.create({
      data: {
        title: "stuck-worker",
        instruction: "hung",
        status: TaskStatus.InProgress,
        priority: 5,
        startedAt: ancient,
        thread: { connect: { id: threadId } },
      },
    });
    createdIssueIds.push(stuck.id);

    const reclaimed = await reclaimStaleWorkers();

    expect(reclaimed).toBeGreaterThanOrEqual(1);
    const after = await prisma.issue.findUnique({ where: { id: stuck.id } });
    expect(after?.status).toBe(TaskStatus.Pending);
    expect(after?.startedAt).toBeNull();
  });
});
