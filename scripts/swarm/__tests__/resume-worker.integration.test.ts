// Pass 10 — resume-worker integration test (DB-gated).
//
// Gated on `DB_TEST=1` because it seeds real Postgres rows via Prisma.
// Seeds an Issue + a paused task_graph_state row, invokes `resumeIssue()`
// with spawn=false so no docker command runs, and asserts the row flips
// back to `running`.

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";

const DB_AVAILABLE = process.env.DB_TEST === "1";
const describeIfDb = DB_AVAILABLE ? describe : describe.skip;

describeIfDb("resume-worker integration", () => {
  let prisma: typeof import("@/lib/prisma").default;
  let resumeIssue: typeof import("../resume-worker").resumeIssue;
  let createdThreadId = "";
  let createdIssueId = "";

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).default;
    resumeIssue = (await import("../resume-worker")).resumeIssue;

    const thread = await prisma.thread.create({
      data: { title: "resume-worker-integration" },
    });
    createdThreadId = thread.id;

    const issue = await prisma.issue.create({
      data: {
        threadId: thread.id,
        instruction: "resume-worker integration fixture",
        status: "in_progress",
      },
    });
    createdIssueId = issue.id;

    await prisma.taskGraphState.create({
      data: {
        issueId: issue.id,
        currentNode: "execute_step",
        status: "paused",
      },
    });
  });

  afterAll(async () => {
    if (createdIssueId) {
      await prisma.taskGraphState.deleteMany({
        where: { issueId: createdIssueId },
      });
      await prisma.issue.delete({ where: { id: createdIssueId } });
    }
    if (createdThreadId) {
      await prisma.thread.delete({ where: { id: createdThreadId } });
    }
    await prisma.$disconnect();
  });

  it("flips the paused row to running and the Issue to in_progress", async () => {
    const result = await resumeIssue(createdIssueId, { spawn: false });
    expect(result.priorStatus).toBe("paused");
    expect(result.spawned).toBe(false);

    const row = await prisma.taskGraphState.findUnique({
      where: { issueId: createdIssueId },
    });
    expect(row?.status).toBe("running");
    expect(row?.interruptReason).toBeNull();

    const issue = await prisma.issue.findUnique({
      where: { id: createdIssueId },
    });
    expect(issue?.status).toBe("in_progress");
  });
});
