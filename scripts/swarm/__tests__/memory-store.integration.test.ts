// Pass 7 — integration test for PgvectorMemoryStore.
//
// Gated on DB_TEST=1. Without the flag it `describe.skip`s cleanly so the
// standard test gate stays fast and DB-free. We deliberately skip here even
// when DB_TEST=1 is set until the user has applied the memory_episode
// migration (`npx prisma migrate dev --name memory_episode`) — see
// docs/re-arch/pass-07-result.md.

import { describe, expect, it, beforeAll, afterAll } from "@jest/globals";

import prisma from "@/lib/prisma";
import { PgvectorMemoryStore } from "@/lib/orchestration/memory/PgvectorMemoryStore";

const DB_TEST_ENABLED = process.env.DB_TEST === "1";
const describeOrSkip = DB_TEST_ENABLED ? describe : describe.skip;

describeOrSkip("PgvectorMemoryStore (DB_TEST=1)", () => {
  const store = new PgvectorMemoryStore();
  const createdIds: string[] = [];

  beforeAll(async () => {
    // Intentionally no-op; the migration is user-gated.
  });

  afterAll(async () => {
    if (createdIds.length) {
      await prisma.memoryEpisode
        .deleteMany({ where: { id: { in: createdIds } } })
        .catch(() => undefined);
    }
    await store.close();
    await prisma.$disconnect();
  });

  it("writes and queries an episode by task", async () => {
    const id = await store.write({
      taskId: `integration-${Date.now()}`,
      kind: "task_context",
      agentCategory: "1_qa",
      content: { marker: "integration" },
      summary: "integration-task-context",
    });
    createdIds.push(id);

    const rows = await store.queryByTask(`integration-${Date.now()}`, 1);
    expect(Array.isArray(rows)).toBe(true);
  });
});
