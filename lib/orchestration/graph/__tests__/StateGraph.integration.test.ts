// Pass 8 — StateGraph integration test (DB-backed, gated on DB_TEST=1).
//
// Seeds a Thread + Issue row, drives a trivial A->B->complete graph through
// three transitions, asserts the final persisted status/history. Cleans up
// both the Issue and the task_graph_state row in afterAll.
//
// Skipped cleanly when DB_TEST !== "1" so `npm test` stays green on dev
// machines without the Cloud SQL proxy running.

import { describe, expect, it, beforeAll, afterAll } from "@jest/globals";

import prisma from "@/lib/prisma";
import { StateGraph } from "../StateGraph";

const shouldRun = process.env.DB_TEST === "1";
const describeMaybe = shouldRun ? describe : describe.skip;

describeMaybe("StateGraph (integration)", () => {
  let threadId: string;
  let issueId: string;

  beforeAll(async () => {
    const thread = await prisma.thread.create({
      data: { title: "pass-08-integration-test" },
    });
    threadId = thread.id;
    const issue = await prisma.issue.create({
      data: {
        threadId,
        instruction: "pass-08 graph integration",
      },
    });
    issueId = issue.id;
  });

  afterAll(async () => {
    await prisma.taskGraphState
      .deleteMany({ where: { issueId } })
      .catch(() => {});
    await prisma.issue.delete({ where: { id: issueId } }).catch(() => {});
    await prisma.thread.delete({ where: { id: threadId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("drives A -> B -> complete with three transitions", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: {
          name: "a",
          run: async () => ({ kind: "goto", next: "b" }),
        },
        b: {
          name: "b",
          run: async () => ({ kind: "goto", next: "c" }),
        },
        c: {
          name: "c",
          run: async () => ({ kind: "complete" }),
        },
      },
    });

    const started = await graph.start(issueId);
    expect(started.currentNode).toBe("a");
    expect(started.status).toBe("running");

    const t1 = await graph.transition(issueId);
    expect(t1.stateAfter.currentNode).toBe("b");

    const t2 = await graph.transition(issueId);
    expect(t2.stateAfter.currentNode).toBe("c");

    const t3 = await graph.transition(issueId);
    expect(t3.stateAfter.status).toBe("completed");

    const final = await graph.get(issueId);
    expect(final?.status).toBe("completed");
    const history = final?.history as Array<Record<string, unknown>>;
    expect(history).toHaveLength(3);
    expect(history[0].node).toBe("a");
    expect(history[1].node).toBe("b");
    expect(history[2].node).toBe("c");
  });
});
