// Pass 10 — resume-worker entry point.
//
// CLI: `npx tsx scripts/swarm/resume-worker.ts <issueId>`.
//
// Preconditions:
//   - A `task_graph_state` row exists for <issueId> with status in
//     { 'paused', 'interrupted' }.
//
// Actions:
//   1. Load the row via `StateGraph.get(issueId)`.
//   2. Call `StateGraph.resume(issueId)` — flips status back to `running`,
//      clears `interruptReason`. Transactional.
//   3. Re-flip the parent `Issue.status` to `in_progress` so the dispatcher
//      does not pick it up twice concurrently.
//   4. Spawn the warm-pool container command that `docker-worker.ts` uses
//      for a fresh start. Because the row already exists, the graph driver
//      in `agent-runner.ts` will detect it via `StateGraph.get()` and skip
//      `start()`, proceeding straight to the `transition()` loop.
//
// This function is exported so `pool-manager.ts` can call it without
// spawning a separate OS process. The CLI at the bottom is a thin wrapper.

import { spawnSync } from "node:child_process";
import prisma from "@/lib/prisma";
import { defineAgentGraph } from "./runner/nodes";
import { TaskStatus } from "./types";
import { appendAudit } from "./audit";

export interface ResumeResult {
  issueId: string;
  priorStatus: string;
  currentNode: string;
  spawned: boolean;
  exitCode?: number;
}

/**
 * Resumes the graph row and optionally spawns the worker process. The
 * `spawn` flag is false in tests (extracted so unit tests can exercise
 * the resume transaction without invoking `docker exec`).
 */
export async function resumeIssue(
  issueId: string,
  opts: { spawn?: boolean } = { spawn: true },
): Promise<ResumeResult> {
  const graph = defineAgentGraph();
  const row = await graph.get(issueId);
  if (!row) {
    throw new Error(
      `resume-worker: no task_graph_state row for issueId=${issueId}`,
    );
  }
  if (row.status !== "paused" && row.status !== "interrupted") {
    throw new Error(
      `resume-worker: cannot resume row with status=${row.status}`,
    );
  }

  const priorStatus = row.status;
  const resumed = await graph.resume(issueId);

  // Keep the Issue.status in-sync so other pollers don't try to re-queue.
  await prisma.issue.update({
    where: { id: issueId },
    data: { status: TaskStatus.InProgress },
  });

  await appendAudit({
    actor: "resume-worker",
    action: "graph.resumed",
    entityType: "task_graph_state",
    entityId: issueId,
    previousState: priorStatus,
    newState: resumed.status,
    metadata: { currentNode: resumed.currentNode },
  });

  if (!opts.spawn) {
    return {
      issueId,
      priorStatus,
      currentNode: resumed.currentNode,
      spawned: false,
    };
  }

  // Spawn the same one-shot worker command. The warm container CMD is
  // `npx tsx /workspace/scripts/swarm/agent-runner.ts`; we run it ad-hoc
  // via `docker exec` against whichever container is available. Because
  // the graph row already exists, `agent-runner.main()` will skip
  // `graph.start()` and jump into the transition loop.
  const containerName =
    process.env.RESUME_CONTAINER_NAME ||
    process.env.WARM_POOL_CONTAINER ||
    "hlbw-worker-warm-default-1";

  const agentCategory = process.env.AGENT_CATEGORY || "default";

  const args = [
    "exec",
    "-e",
    `AGENT_ISSUE_ID=${issueId}`,
    "-e",
    `AGENT_CATEGORY=${agentCategory}`,
    "-e",
    `WORKTREE_PATH=${process.env.WORKTREE_PATH || "/workspace"}`,
    containerName,
    "npx",
    "tsx",
    "/workspace/scripts/swarm/agent-runner.ts",
  ];

  const result = spawnSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const exitCode = result.status ?? -1;

  return {
    issueId,
    priorStatus,
    currentNode: resumed.currentNode,
    spawned: true,
    exitCode,
  };
}

if (require.main === module) {
  const issueId = process.argv[2];
  if (!issueId) {
    console.error("Usage: resume-worker.ts <issueId>");
    process.exit(1);
  }
  resumeIssue(issueId, { spawn: true })
    .then((r) => {
      console.log(
        `[resume-worker] ${issueId} resumed from ${r.priorStatus} at node=${r.currentNode}; spawn exitCode=${r.exitCode}`,
      );
    })
    .catch((err) => {
      console.error("[resume-worker] fatal:", (err as Error).message);
      process.exit(1);
    });
}
