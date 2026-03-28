/**
 * Swarm Observability Demo
 *
 * Exercises the full orchestration pipeline (task → arbiter → worker → watchdog)
 * and emits real OpenTelemetry traces to the local Jaeger instance so the
 * Jaeger UI can be explored end-to-end.
 *
 * Usage:  npx tsx scripts/swarm/demo-traces.ts
 * Jaeger:  http://localhost:16686  (service: hlbw-swarm)
 */

import { startTracing, stopTracing, getTracer } from "./tracing";
import {
  addTask,
  updateTaskStatus,
  addWorker,
  updateWorkerStatus,
  cleanupRetention,
  getState,
} from "./state-manager";
import { getNextAvailableTask } from "./arbiter";
import { TaskStatus, WorkerStatus } from "./types";
import { appendAudit } from "./audit";
import { SWARM_POLICY } from "./policy";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const DEMO_TASKS = [
  {
    title: "Update Prisma schema for UserPreferences",
    description:
      "Add a UserPreferences model with theme, language, and timezone fields.",
    priority: 1,
    metadata: {},
    dependencies: [],
  },
  {
    title: "Scaffold /api/preferences route",
    description:
      "Implement GET/PUT routes for user preferences with auth guard.",
    priority: 2,
    metadata: {},
    dependencies: [],
  },
  {
    title: "Build PreferencesPanel component",
    description:
      "React component with form inputs for theme, language, timezone. Uses SWR.",
    priority: 2,
    metadata: {},
    dependencies: [],
  },
  {
    title: "Write unit tests for preferences API",
    description:
      "Jest tests covering auth, validation, and CRUD for the preferences API.",
    priority: 3,
    metadata: {},
    dependencies: [],
  },
];

// ---------------------------------------------------------------------------
// Simulated worker lifecycle  (no real Docker needed)
// ---------------------------------------------------------------------------

async function simulateWorkerLifecycle(
  taskId: string,
  taskTitle: string,
  branchName: string,
) {
  const tracer = getTracer();
  return tracer.startActiveSpan(`Worker:lifecycle`, async (rootSpan) => {
    rootSpan.setAttribute("task.id", taskId);
    rootSpan.setAttribute("task.title", taskTitle);
    rootSpan.setAttribute("branch.name", branchName);

    // Phase 1 — Spawn
    const worker = await tracer.startActiveSpan(
      "Worker:spawn",
      async (span) => {
        span.setAttribute("task.id", taskId);
        span.setAttribute("provider", SWARM_POLICY.defaultProvider);
        span.setAttribute("model", SWARM_POLICY.defaultModel);

        const w = await addWorker({
          taskId,
          provider: SWARM_POLICY.defaultProvider,
          modelId: SWARM_POLICY.defaultModel,
          status: WorkerStatus.Starting,
          metadata: { branchName, demo: true },
        });

        span.setAttribute("worker.id", w.id);
        await sleep(200); // simulate container pull
        span.end();
        return w;
      },
    );

    // Phase 2 — Running (simulate work with sub-spans)
    await tracer.startActiveSpan("Worker:execute", async (span) => {
      span.setAttribute("worker.id", worker.id);
      await updateWorkerStatus(worker.id, WorkerStatus.Running, {
        runtimeId: `demo-container-${worker.id}`,
      });

      // Sub-span: reading files
      await tracer.startActiveSpan("Worker:readFiles", async (sub) => {
        sub.setAttribute("files.count", 4);
        await sleep(300);
        sub.end();
      });

      // Sub-span: applying edits
      await tracer.startActiveSpan("Worker:applyEdits", async (sub) => {
        sub.setAttribute("edits.count", 7);
        sub.setAttribute("lines.added", 128);
        sub.setAttribute("lines.removed", 14);
        await sleep(400);
        sub.end();
      });

      // Sub-span: running tests
      await tracer.startActiveSpan("Worker:runTests", async (sub) => {
        sub.setAttribute("tests.passed", 12);
        sub.setAttribute("tests.failed", 0);
        await sleep(350);
        sub.end();
      });

      span.end();
    });

    // Phase 3 — Completion
    await tracer.startActiveSpan("Worker:complete", async (span) => {
      span.setAttribute("worker.id", worker.id);
      await updateWorkerStatus(worker.id, WorkerStatus.Completed, {
        result: `Successfully completed: ${taskTitle}`,
      });
      await updateTaskStatus(
        taskId,
        TaskStatus.Completed,
        `worker-${worker.id}`,
      );
      await appendAudit({
        actor: `demo-worker`,
        action: "worker.completed",
        entityType: "worker",
        entityId: worker.id,
        newState: WorkerStatus.Completed,
        metadata: { taskId, demo: true },
      });
      span.end();
    });

    rootSpan.end();
    return worker;
  });
}

// ---------------------------------------------------------------------------
// Main Demo Flow
// ---------------------------------------------------------------------------

async function main() {
  startTracing();
  const tracer = getTracer();

  console.log("\n🚀 === SWARM OBSERVABILITY DEMO ===\n");
  console.log("Traces will be sent to Jaeger at http://localhost:16686");
  console.log('Service name: "hlbw-swarm"\n');

  // ---- Master trace: entire orchestration ----
  await tracer.startActiveSpan(
    "MasterAgent:orchestrate",
    async (masterSpan) => {
      masterSpan.setAttribute("demo", true);
      masterSpan.setAttribute("task.count", DEMO_TASKS.length);

      // Step 1: Register tasks
      console.log("📝 Step 1: Registering demo tasks...");
      const taskIds: string[] = [];
      for (const t of DEMO_TASKS) {
        const created = await tracer.startActiveSpan(
          "MasterAgent:registerTask",
          async (span) => {
            span.setAttribute("task.title", t.title);
            span.setAttribute("task.priority", t.priority);
            const task = await addTask(t);
            span.setAttribute("task.id", task.id);
            span.end();
            return task;
          },
        );
        taskIds.push(created.id);
        console.log(`   ✅ ${created.id}: ${created.title}`);
      }

      // Make the second task depend on the first (to demo dependency resolution)
      const { withStateLock } = await import("./state-manager");
      await withStateLock(async (state) => {
        const secondTask = state.tasks.find((t) => t.id === taskIds[1]);
        if (secondTask) {
          secondTask.dependencies = [taskIds[0]];
          console.log(`   🔗 ${taskIds[1]} now depends on ${taskIds[0]}`);
        }
      });

      // Step 2: Arbiter — pick first available
      console.log("\n🧠 Step 2: Running arbiter to find next task...");
      const firstTask = await getNextAvailableTask();
      if (firstTask) {
        console.log(
          `   ➡️  Arbiter selected: ${firstTask.id} (${firstTask.title})`,
        );
      }

      // Step 3: Simulate workers
      console.log(
        "\n⚙️  Step 3: Simulating worker lifecycle for each task...\n",
      );
      for (let i = 0; i < taskIds.length; i++) {
        const taskId = taskIds[i];
        const t = DEMO_TASKS[i];
        const branch = `swarm/demo-${t.title.toLowerCase().replace(/\s+/g, "-").slice(0, 30)}`;

        console.log(`   🔧 Worker for "${t.title}"...`);
        await updateTaskStatus(taskId, TaskStatus.InProgress, "master-agent");
        await simulateWorkerLifecycle(taskId, t.title, branch);
        console.log(`   ✅ Completed.`);
      }

      // Step 4: Watchdog health check
      console.log("\n🐕 Step 4: Simulating watchdog health scan...");
      await tracer.startActiveSpan("Watchdog:healthCheck", async (span) => {
        const postState = await getState();
        const active = postState.workers.filter(
          (w) =>
            w.status === WorkerStatus.Running ||
            w.status === WorkerStatus.Starting,
        ).length;
        const completed = postState.workers.filter(
          (w) => w.status === WorkerStatus.Completed,
        ).length;
        span.setAttribute("workers.active", active);
        span.setAttribute("workers.completed", completed);
        span.setAttribute("workers.total", postState.workers.length);
        console.log(
          `   Workers: ${active} active, ${completed} completed, ${postState.workers.length} total`,
        );
        span.end();
      });

      // Step 5: Retention cleanup
      console.log("\n🧹 Step 5: Running retention cleanup...");
      await tracer.startActiveSpan(
        "Watchdog:retentionCleanup",
        async (span) => {
          const result = await cleanupRetention();
          span.setAttribute("removed.tasks", result.removedTasks);
          span.setAttribute("removed.workers", result.removedWorkers);
          console.log(
            `   Cleaned up ${result.removedTasks} tasks, ${result.removedWorkers} workers.`,
          );
          span.end();
        },
      );

      masterSpan.end();
    },
  );

  console.log("\n🎉 Demo complete! Open Jaeger to explore traces:");
  console.log('   📊 http://localhost:16686  →  Service: "hlbw-swarm"\n');
  console.log("Expected traces:");
  console.log("   • MasterAgent:orchestrate  (root span, contains everything)");
  console.log("   • MasterAgent:registerTask  (one per demo task)");
  console.log("   • Arbiter:getNextAvailableTask  (dependency resolution)");
  console.log(
    "   • Worker:lifecycle → Worker:spawn → Worker:execute → Worker:complete",
  );
  console.log(
    "   • Worker:readFiles / Worker:applyEdits / Worker:runTests  (nested work)",
  );
  console.log("   • Watchdog:healthCheck / Watchdog:retentionCleanup\n");

  // Allow OTLP exporter to flush all spans
  await sleep(2000);
  await stopTracing();
  console.log("✅ Traces flushed. Jaeger should be populated now.");
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
