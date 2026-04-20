// Arbiter concurrent-race integration test (Pass 5 / §5.4).
//
// Gated behind `DB_TEST=1` because it hits a real Postgres over the Cloud
// SQL proxy. Without the proxy running, every connect blocks on a dead TCP
// socket, so we `describe.skip` by default to keep the standard test gate
// fast and DB-free.
//
// Prereqs when DB_TEST=1 is set:
//   1. `cloud-sql-proxy` running and pointed at the project's Cloud SQL
//      instance on localhost:5432 (or whatever DATABASE_URL uses).
//   2. `npx prisma migrate deploy` run against that target.
//
// Test body:
//   - Seed one pending Issue with no blockers.
//   - Spawn two concurrent `getNextAvailableTask()` calls.
//   - Exactly one must return the task; the other must return null.
//   - The Issue's status must be `in_progress` after the race.
//   - Clean up the seeded row in `afterEach`.

import {
  describe,
  expect,
  it,
  beforeAll,
  afterAll,
  afterEach,
} from "@jest/globals";
import prisma from "@/lib/prisma";
import { getNextAvailableTask } from "../arbiter";
import { TaskStatus } from "../types";

const DB_TEST_ENABLED = process.env.DB_TEST === "1";
const describeOrSkip = DB_TEST_ENABLED ? describe : describe.skip;

describeOrSkip("arbiter race (DB_TEST=1)", () => {
  let threadId: string;
  const createdIssueIds: string[] = [];

  beforeAll(async () => {
    const thread = await prisma.thread.create({
      data: { title: "arbiter-integration-test" },
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

  it("claims a task exactly once under concurrent arbiters", async () => {
    const seeded = await prisma.issue.create({
      data: {
        title: "race-test",
        instruction: "concurrent claim test",
        status: TaskStatus.Pending,
        priority: 9,
        thread: { connect: { id: threadId } },
      },
    });
    createdIssueIds.push(seeded.id);

    const [a, b] = await Promise.all([
      getNextAvailableTask(),
      getNextAvailableTask(),
    ]);

    const winners = [a, b].filter((t) => t !== null);
    const nulls = [a, b].filter((t) => t === null);
    expect(winners.length).toBe(1);
    expect(nulls.length).toBe(1);
    expect(winners[0]!.id).toBe(seeded.id);

    const post = await prisma.issue.findUnique({ where: { id: seeded.id } });
    expect(post?.status).toBe(TaskStatus.InProgress);
  });
});
