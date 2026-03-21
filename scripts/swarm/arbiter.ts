import { getState } from "./state-manager";
import { Task, TaskStatus } from "./types";
import { getTracer, startTracing, stopTracing } from "./tracing";

export async function getNextAvailableTask(): Promise<Task | null> {
  const tracer = getTracer();
  return tracer.startActiveSpan("Arbiter:getNextAvailableTask", async (span) => {
    try {
      const state = await getState();
      const completedIds = new Set(
        state.tasks.filter((t) => t.status === TaskStatus.Completed).map((t) => t.id)
      );

      const candidates = state.tasks
        .filter((t) => t.status === TaskStatus.Pending)
        .filter((t) => t.dependencies.every((dep) => completedIds.has(dep)));

      span.setAttribute("candidates.length", candidates.length);

      if (candidates.length === 0) {
        span.end();
        return null;
      }

      candidates.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority; // lower priority number runs first
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      const selected = candidates[0];
      span.setAttribute("selected.taskId", selected.id);
      span.end();
      return selected;
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
  getNextAvailableTask().then((task) => {
    if (task) {
      console.log(`Next task: ${task.id} (Priority: ${task.priority})`);
      console.log(`Title: ${task.title}`);
    } else {
      console.log("No pending tasks available.");
    }
  }).catch((err) => {
    console.error("Arbiter error:", err);
    process.exit(1);
  }).finally(() => {
    stopTracing();
  });
}
