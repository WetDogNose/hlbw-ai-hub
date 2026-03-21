// Convenience Delegate API (Gap 3)
// Single-call: create task → create isolation → assign worker → return instructions

import { addTask, assignTask, addWorker } from "./state-manager";
import { createWorktree } from "./manage-worktree";
import { TaskStatus, WorkerStatus } from "./types";
import { SWARM_POLICY } from "./policy";
import { getTracer, startTracing, stopTracing } from "./tracing";
import { appendAudit } from "./audit";
import { shareTaskContext, getSharedContext, closeMemoryClient } from "./shared-memory";

export interface DelegateRequest {
  task: string;          // title / instruction
  description?: string;  // longer description
  priority?: number;     // 1-5 (default 3)
  agentType?: string;    // "general" | "specialist"
  dependencies?: string[];
}

export interface DelegateResult {
  taskId: string;
  workerId: string;
  isolationId: string;
  worktreePath: string;
  instructions: string;
  sharedContext: string[];
}

export async function delegate(req: DelegateRequest): Promise<DelegateResult> {
  const tracer = getTracer();
  return tracer.startActiveSpan("Delegate:execute", async (span) => {
    span.setAttribute("task.title", req.task);
    span.setAttribute("task.priority", req.priority || 3);

    try {
      // 1. Create task
      const task = await addTask({
        title: req.task,
        description: req.description || req.task,
        priority: req.priority || 3,
        dependencies: req.dependencies || [],
        metadata: { agentType: req.agentType || "general" },
      });

      // 2. Create isolation
      const branchName = `swarm-${task.id}`;
      const worktreePath = createWorktree(branchName);

      // 3. Assign task
      await assignTask(task.id, req.agentType || "general");

      // 4. Register worker
      const worker = await addWorker({
        taskId: task.id,
        provider: SWARM_POLICY.defaultProvider,
        modelId: SWARM_POLICY.defaultModel,
        status: WorkerStatus.Starting,
        metadata: { branchName, agentType: req.agentType || "general" },
      });

      const result: DelegateResult = {
        taskId: task.id,
        workerId: worker.id,
        isolationId: branchName,
        worktreePath,
        instructions: `Run worker in isolated workspace ${branchName} at ${worktreePath}`,
        sharedContext: [],
      };

      // 5. Share task context into Neo4j shared memory
      try {
        await shareTaskContext(task.id, req.task, req.description || req.task, branchName);
        result.sharedContext = await getSharedContext(req.task);
      } catch (memErr: any) {
        console.error("SharedMemory: Non-fatal error during delegation:", memErr.message);
      }

      await appendAudit({
        actor: "delegate",
        action: "swarm.delegated",
        entityType: "task",
        entityId: task.id,
        newState: "assigned",
        metadata: { workerId: worker.id, isolationId: branchName },
      });

      span.setAttribute("task.id", task.id);
      span.setAttribute("worker.id", worker.id);
      span.end();
      return result;
    } catch (err: any) {
      span.recordException(err);
      span.end();
      throw err;
    }
  });
}

// CLI usage
if (require.main === module) {
  startTracing();
  const task = process.argv[2];
  const priority = parseInt(process.argv[3] || "3", 10);

  if (!task) {
    console.error("Usage: tsx delegate.ts <task-description> [priority]");
    stopTracing();
    process.exit(1);
  }

  delegate({ task, priority })
    .then((result) => {
      console.log("Delegation complete:");
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(console.error)
    .finally(async () => {
      await closeMemoryClient();
      await stopTracing();
    });
}
