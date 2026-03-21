import { getState, saveState, updateTaskStatus, updateWorkerStatus, cleanupRetention, listWorkers } from "./state-manager";
import { TaskStatus, WorkerStatus } from "./types";
import { removeWorktree, listWorktrees } from "./manage-worktree";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getTracer, startTracing, stopTracing } from "./tracing";
import { SWARM_POLICY } from "./policy";
import { appendAudit } from "./audit";
import { getNextAvailableTask } from "./arbiter";
import { addObservations, closeMemoryClient } from "./shared-memory";

async function getMcpClient() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [".agents/mcp-servers/docker-manager-mcp/dist/index.js"],
  });
  const client = new Client({ name: "watchdog-client", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

// --- Gap 8: Watchdog Feed (Auto-Assign) ---

async function feedPendingTasks(): Promise<number> {
  let fed = 0;
  // Check active worker count
  const activeWorkers = await listWorkers({ status: WorkerStatus.Running });
  const startingWorkers = await listWorkers({ status: WorkerStatus.Starting });
  const activeCount = activeWorkers.length + startingWorkers.length;
  const availableSlots = SWARM_POLICY.maxActiveWorkers - activeCount;

  if (availableSlots <= 0) {
    console.log(`Watchdog feed: No available slots (${activeCount}/${SWARM_POLICY.maxActiveWorkers}).`);
    return 0;
  }

  // Try to assign up to availableSlots pending tasks
  for (let i = 0; i < availableSlots; i++) {
    const nextTask = await getNextAvailableTask();
    if (!nextTask) break;

    await updateTaskStatus(nextTask.id, TaskStatus.InProgress, "watchdog-feed");
    await appendAudit({
      actor: "watchdog",
      action: "watchdog.fed",
      entityType: "task",
      entityId: nextTask.id,
      newState: TaskStatus.InProgress,
      reason: "Auto-assigned by watchdog feed",
    });
    console.log(`Watchdog fed task: ${nextTask.id} (${nextTask.title})`);
    fed++;
  }

  return fed;
}

// --- Gap 9: Stale Requeue with Counter ---

export async function runWatchdog() {
  const tracer = getTracer();
  return tracer.startActiveSpan("Watchdog:run", async (span) => {
    span.setAttribute("timeout.minutes", SWARM_POLICY.workerTimeoutMinutes);

    const state = await getState();
    const now = Date.now();
    let modified = false;
    let client: Client | null = null;
    let staleCount = 0;

    try {
      for (const worker of state.workers) {
        if (worker.status === WorkerStatus.Running || worker.status === WorkerStatus.Starting) {
          if (worker.startedAt) {
            const startedTime = new Date(worker.startedAt).getTime();
            const elapsedMinutes = (now - startedTime) / (1000 * 60);

            if (elapsedMinutes > SWARM_POLICY.workerTimeoutMinutes) {
              staleCount++;
              console.log(`Worker ${worker.id} exceeded timeout. Re-queuing task ${worker.taskId}.`);
              worker.status = WorkerStatus.Timeout;
              worker.completedAt = new Date().toISOString();

              // Increment stale count on the task (Gap 9)
              const task = state.tasks.find((t) => t.id === worker.taskId);
              if (task) {
                task.metadata.staleCount = ((task.metadata.staleCount as number) || 0) + 1;
                task.metadata.lastStaleAgent = worker.metadata?.branchName;
                task.metadata.lastStaleAt = new Date().toISOString();
                task.status = TaskStatus.Pending;
                task.startedAt = undefined;
                task.assignedAgent = undefined;
              }

              modified = true;

              await appendAudit({
                actor: "watchdog",
                action: "worker.timeout",
                entityType: "worker",
                entityId: worker.id,
                previousState: WorkerStatus.Running,
                newState: WorkerStatus.Timeout,
                metadata: { taskId: worker.taskId, elapsedMinutes, staleCount: task?.metadata.staleCount },
              });

              // Update shared memory with stale status
              try {
                await addObservations(`task:${worker.taskId}`, [
                  `Status: stale (timeout after ${Math.round(elapsedMinutes)}min)`,
                  `Stale count: ${task?.metadata.staleCount}`,
                  `RequeuedAt: ${new Date().toISOString()}`,
                ]);
              } catch (memErr) {
                // Non-fatal
              }

              // Stop container via MCP
              const containerId = worker.metadata?.containerId;
              if (containerId && typeof containerId === "string") {
                if (!client) client = await getMcpClient();
                try {
                  await client.callTool({ name: "stop_container", arguments: { containerId } });
                  console.log(`Stopped container ${containerId} via Docker MCP.`);
                } catch (err) {
                  console.error(`Failed to stop container ${containerId}:`, err);
                }
              }

              // Cleanup worktree
              const isolationId = task?.isolationId || (worker.metadata?.branchName as string);
              if (isolationId && typeof isolationId === "string") {
                console.log(`Cleaning up worktree ${isolationId}`);
                try {
                  removeWorktree(isolationId, true);
                } catch (e) {
                  console.error(`Failed to cleanup worktree ${isolationId}:`, e);
                }
              }
            }
          }
        }
      }

      span.setAttribute("stale.count", staleCount);
      span.setAttribute("state.modified", modified);

      if (modified) {
        await saveState(state);
      }

      // --- Gap 8: Feed pending tasks ---
      const fed = await feedPendingTasks();
      console.log(`Watchdog: Fed ${fed} pending tasks into available capacity.`);

      // --- Gap 9: Retention cleanup ---
      const cleanup = await cleanupRetention();
      if (cleanup.removedTasks > 0 || cleanup.removedWorkers > 0) {
        console.log(`Watchdog: Cleaned up ${cleanup.removedTasks} tasks, ${cleanup.removedWorkers} workers (retention policy).`);
      }

      // --- Health summary ---
      const activeTasks = state.tasks.filter((t) => t.status === TaskStatus.InProgress).length;
      const pendingTasks = state.tasks.filter((t) => t.status === TaskStatus.Pending).length;
      const activeW = state.workers.filter((w) => w.status === WorkerStatus.Running || w.status === WorkerStatus.Starting).length;
      const worktrees = listWorktrees();

      console.log(`\n--- Watchdog Health Summary ---`);
      console.log(`Tasks:    ${pendingTasks} pending, ${activeTasks} active, ${staleCount} stale`);
      console.log(`Workers:  ${activeW} active / ${SWARM_POLICY.maxActiveWorkers} max`);
      console.log(`Isolation: ${worktrees.length} worktrees / ${SWARM_POLICY.maxActiveIsolation} max`);
      console.log(`-------------------------------\n`);

      if (!modified && staleCount === 0) {
        console.log("Watchdog: All active workers healthy.");
      }
    } catch (err: any) {
      span.recordException(err);
      throw err;
    } finally {
      if (client) {
        await client.close();
      }
      span.end();
    }
  });
}

if (require.main === module) {
  startTracing();
  runWatchdog()
    .catch(console.error)
    .finally(async () => {
      await closeMemoryClient();
      await stopTracing();
    });
}
