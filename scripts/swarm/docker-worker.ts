// Pass 10 — Docker worker now spawns the one-shot graph driver directly.
//
// The pass-9 refactor made `agent-runner.ts` a single-shot CLI that reads
// `AGENT_ISSUE_ID` from the environment and drives the StateGraph to
// terminal. The HTTP A2A handshake that previously lived here has been
// retired — see pass-09-verified.md §"HTTP dispatch mismatch" and the
// checkpoint-10 frozen-interfaces list.
//
// Control flow per call:
//   1. createWorktree(branchName) -> bind-mount target.
//   2. addWorker() -> register the worker row in the JSON snapshot.
//   3. docker exec <warmContainer> npx tsx /workspace/scripts/swarm/agent-runner.ts
//      with AGENT_ISSUE_ID/AGENT_CATEGORY/AGENT_INSTRUCTION/WORKTREE_PATH
//      injected via `docker exec -e`.
//   4. The container process exits when the graph reaches `complete`/`error`/
//      `interrupt`; we propagate the exit code and collected stdout.
//   5. Cleanup worktree + mark worker/task state.

import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import {
  addWorker,
  updateTaskStatus,
  updateWorkerStatus,
} from "./state-manager";
import { TaskStatus, WorkerStatus } from "./types";
import { createWorktree, removeWorktree } from "./manage-worktree";
import { spawnSync } from "node:child_process";
import { getTracer, startTracing, stopTracing } from "./tracing";
import { SWARM_POLICY } from "./policy";
import { appendAudit } from "./audit";

export interface WorkerSpawnResult {
  workerId: string;
  containerId: string;
  taskId: string;
  logs?: string;
  status?: string;
  exitCode?: number;
}

/**
 * Resolve the warm-pool container that should run this task based on the
 * agent category. Mirrors `pool-manager.ts` so the sharding stays consistent.
 */
function resolveWarmHost(taskId: string, agentCategory: string): string {
  const poolSize = 21;
  const roles = [
    "1_qa",
    "2_source",
    "3_cloud",
    "4_db",
    "5_bizops",
    "6_project",
    "7_automation",
  ];
  let replicas = Math.floor(poolSize / roles.length);
  const roleIndex = roles.indexOf(agentCategory);
  if (roleIndex !== -1 && roleIndex < poolSize % roles.length) {
    replicas += 1;
  }
  if (replicas === 0) replicas = 1;
  const subIndex =
    (parseInt(taskId.split("-").pop() || "0", 16) % replicas) + 1;
  return `hlbw-worker-warm-${agentCategory}-${subIndex}`;
}

/**
 * Spawns the one-shot graph driver inside the warm-pool container for the
 * given issue. Replaces the old HTTP A2A POST to localhost:8000/a2a.
 */
export async function spawnDockerWorker(
  taskId: string,
  instructionPayload: string,
  branchName: string,
  agentCategory: string = "default",
): Promise<WorkerSpawnResult> {
  const tracer = getTracer();
  return tracer.startActiveSpan(`spawn-worker-${taskId}`, async (span) => {
    span.setAttribute("task.id", taskId);
    span.setAttribute("agent.category", agentCategory);

    const worktreePath = createWorktree(branchName);
    span.setAttribute("worktree.path", worktreePath);

    const worker = await addWorker({
      taskId,
      provider: "docker-worker",
      modelId: SWARM_POLICY.defaultModel,
      status: WorkerStatus.Starting,
      metadata: { branchName, agentType: agentCategory },
    });
    span.setAttribute("worker.id", worker.id);

    await updateTaskStatus(taskId, TaskStatus.InProgress, "docker-worker");
    await appendAudit({
      actor: "docker-worker",
      action: "worker.spawn",
      entityType: "worker",
      entityId: worker.id,
      newState: WorkerStatus.Starting,
      metadata: { taskId, branchName, agentCategory },
    });

    const targetHost = resolveWarmHost(taskId, agentCategory);
    console.log(
      `[Swarm] Dispatching ${taskId} to ${targetHost} via docker exec...`,
    );

    // Construct the `docker exec` invocation. Environment variables carry
    // the full task identity; the container CMD (set by pool-manager) is
    // `npx tsx /workspace/scripts/swarm/agent-runner.ts`, but we invoke
    // the same entry point ad-hoc here so the warm worker can run any
    // incoming issue without a restart.
    const args = [
      "exec",
      "-e",
      `AGENT_ISSUE_ID=${taskId}`,
      "-e",
      `AGENT_CATEGORY=${agentCategory}`,
      "-e",
      `AGENT_INSTRUCTION=${instructionPayload}`,
      "-e",
      `WORKTREE_PATH=/workspace/${path.basename(worktreePath)}`,
      targetHost,
      "npx",
      "tsx",
      "/workspace/scripts/swarm/agent-runner.ts",
    ];

    const result = spawnSync("docker", args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: SWARM_POLICY.workerTimeoutMinutes * 60 * 1000,
    });

    const logs = (result.stdout ?? "") + (result.stderr ?? "");
    const exitCode = result.status ?? -1;
    span.setAttribute("worker.exitCode", exitCode);

    try {
      if (exitCode !== 0) {
        await updateWorkerStatus(worker.id, WorkerStatus.Failed, {
          result: logs.slice(0, 4000),
          error: `agent-runner exited with code ${exitCode}`,
        });
        await updateTaskStatus(taskId, TaskStatus.Failed, "docker-worker");
        throw new Error(
          `agent-runner failed (exit ${exitCode}) on ${targetHost}: ${logs.slice(-2000)}`,
        );
      }

      await updateWorkerStatus(worker.id, WorkerStatus.Completed, {
        result: logs.slice(0, 4000),
      });
      await updateTaskStatus(taskId, TaskStatus.Completed, "docker-worker");

      return {
        workerId: worker.id,
        containerId: targetHost,
        taskId,
        logs,
        status: "exited",
        exitCode,
      };
    } finally {
      console.log(`Task ${taskId} life-cycle complete. Reclaiming worktree...`);
      try {
        removeWorktree(branchName, true);
      } catch (e) {
        /* non-fatal */
      }
      span.end();
    }
  });
}

/**
 * Spawns a batch of workers in parallel.
 */
export async function spawnBatch(
  tasks: {
    taskId: string;
    instruction: string;
    branchName: string;
    agentCategory?: string;
  }[],
): Promise<any[]> {
  console.log(`[Batch] Launching ${tasks.length} parallel threads...`);
  const results = await Promise.allSettled(
    tasks.map((t) =>
      spawnDockerWorker(t.taskId, t.instruction, t.branchName, t.agentCategory),
    ),
  );
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { taskId: tasks[i].taskId, error: (r.reason as Error).message };
  });
}

// Dummy stubs for benchmark compatibility
export async function getWorkerLogs(_id: string): Promise<string> {
  return "Logs managed by synchronous agent-runner flow.";
}
export async function waitForWorker(_id: string): Promise<string> {
  return "exited";
}

if (require.main === module) {
  startTracing();
  const taskId = process.argv[2];
  const instruction = process.argv[3] ?? "";
  const branchName = process.argv[4] ?? `task-${taskId}`;
  const agentCategory = process.argv[5] ?? "default";
  if (!taskId) {
    console.error(
      "Usage: docker-worker.ts <taskId> <instruction> <branchName> [agentCategory]",
    );
    process.exit(1);
  }
  spawnDockerWorker(taskId, instruction, branchName, agentCategory)
    .then((r) => {
      console.log("[docker-worker] done:", r.status, r.workerId);
    })
    .catch((err) => {
      console.error("[docker-worker] fatal:", err);
      process.exit(1);
    })
    .finally(() => {
      void stopTracing();
    });
}
