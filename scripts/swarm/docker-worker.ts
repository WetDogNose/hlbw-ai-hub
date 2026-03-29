import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import {
  addWorker,
  updateTaskStatus,
  updateWorkerStatus,
} from "./state-manager";
import { TaskStatus, WorkerStatus } from "./types";
import { createWorktree, removeWorktree } from "./manage-worktree";
import { execSync } from "node:child_process";
import { getTracer, startTracing, stopTracing } from "./tracing";
import { SWARM_POLICY } from "./policy";
import { appendAudit } from "./audit";

export interface WorkerSpawnResult {
  workerId: string;
  containerId: string;
  taskId: string;
  logs?: string;
  status?: string;
}

/**
 * Spawns an ephemeral Docker worker to execute a specific task instruction.
 * Optimized for high-throughput synchronous execution.
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

    try {
      // 1. Prepare Isolation
      console.log(`Preparing isolation for ${taskId}...`);
      const worktreePath = createWorktree(branchName);
      span.setAttribute("worktree.path", worktreePath);

      // 2. Register Worker
      const worker = await addWorker({
        taskId: taskId,
        provider: "docker-worker",
        modelId: "warm-pool",
        status: WorkerStatus.Starting,
        metadata: { branchName, agentType: agentCategory }
      });
      span.setAttribute("worker.id", worker.id);

      await updateTaskStatus(taskId, TaskStatus.InProgress, "docker-worker");
      console.log(`Delegating task ${taskId} to warm pool...`);

      // 3. Sharding across warm pool by explicit role
      const poolSize = 21;
      const roles = ["1_qa", "2_source", "3_cloud", "4_db", "5_bizops", "6_project", "7_automation"];
      
      // Exact calculation to mimic how pool-manager allocates replicas
      let replicas = Math.floor(poolSize / roles.length);
      const roleIndex = roles.indexOf(agentCategory);
      if (roleIndex !== -1 && roleIndex < poolSize % roles.length) {
          replicas += 1; // It gets the remainder bonus replica
      }
      // If agentCategory is entirely unknown, fallback to first generic
      if (replicas === 0) replicas = 1; 
      
      const subIndex = (parseInt(taskId.split("-").pop() || "0", 16) % replicas) + 1;
      
      const targetHost = `hlbw-worker-warm-${agentCategory}-${subIndex}`;
      const containerId = `exec-${taskId}`;


      // 4. Synchronous Payload Execution
      const a2aPayload = {
        version: "1.0",
        task_id: taskId,
        session_id: taskId,
        message: instructionPayload,
        context: {
          worktree: path.basename(worktreePath), // Pass the folder name only
          persistence_mode: "ephemeral",
          category: agentCategory,
        },
      };

      // Use temporary file to avoid shell escaping/interpretation issues on host
      const payloadFile = path.resolve(
        process.cwd(),
        `tmp_payload_${taskId}.json`,
      );
      fs.writeFileSync(payloadFile, JSON.stringify(a2aPayload));

      console.log(`[Swarm] Dispatching to ${targetHost}...`);

      // Copy to container and execute
      const { spawnSync } = require("child_process");
      spawnSync("docker", [
        "cp",
        payloadFile,
        `${targetHost}:/tmp/payload.json`,
      ]);

      const result = spawnSync(
        "docker",
        [
          "exec",
          targetHost,
          "curl",
          "-s",
          "--max-time",
          "300",
          "-X",
          "POST",
          "-H",
          "Content-Type: application/json",
          "-d",
          "@/tmp/payload.json",
          "http://localhost:8000/a2a",
        ],
        { encoding: "utf8" },
      );

      if (result.status !== 0) {
        throw new Error(result.stderr || "Execution failed");
      }
      const resultBody = result.stdout;

      // Cleanup host payload
      try {
        fs.unlinkSync(payloadFile);
      } catch (e) {}

      // 5. Cleanup Isolation immediately
      console.log(`Task ${taskId} life-cycle complete. Reclaiming worktree...`);
      try {
        removeWorktree(branchName, true);
      } catch (e) {}

      await updateWorkerStatus(worker.id, WorkerStatus.Completed);
      await updateTaskStatus(taskId, TaskStatus.Completed, "docker-worker");

      return {
        workerId: worker.id,
        containerId,
        taskId,
        logs: resultBody,
        status: "exited",
      };
    } catch (err: any) {
      span.recordException(err);
      console.error(`Failed to execute task ${taskId}:`, err.message);
      await updateTaskStatus(taskId, TaskStatus.Failed, "docker-worker");
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Spawns a batch of workers in parallel.
 */
export async function spawnBatch(tasks: any[]): Promise<any[]> {
  console.log(`[Batch] Launching ${tasks.length} parallel threads...`);
  const results = await Promise.allSettled(
    tasks.map((t) =>
      spawnDockerWorker(t.taskId, t.instruction, t.branchName, t.agentCategory),
    ),
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { taskId: tasks[i].taskId, error: r.reason.message };
  });
}

// Dummy stubs for benchmark compatibility
export async function getWorkerLogs(id: string) {
  return "Logs managed by sync flow.";
}
export async function waitForWorker(id: string) {
  return "exited";
}
