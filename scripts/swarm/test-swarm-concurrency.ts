import { spawnBatch } from "./docker-worker";
import { startTracing, stopTracing } from "./tracing";

async function main() {
  startTracing();
  console.log("🚀 Testing Local GPU GPU-Accelerated Swarm Concurrency...");

  // We will spin up 15 containers targeting the '1_qa' category to prove the system
  // can natively handle the massive multi-threading requested and dispatch tasks to the new constraints limits
  const tasks = Array.from({ length: 15 }, (_, i) => {
    const timestamp = Date.now();
    return {
      taskId: `demo-concurrency-task-${timestamp}-${i}`,
      instruction: `Analyze the environment and ensure you can ping the local Ollama LLM provider. Agent ${i}`,
      branchName: `demo-bench-${timestamp}-${i}`,
      agentType: "ts" as const,
      agentCategory: "1_qa",
    };
  });

  console.log(`Dispatching ${tasks.length} sub-agents simultaneously...`);
  const startTime = Date.now();

  try {
    const results = await spawnBatch(tasks);

    const successes = results.filter((r) => "workerId" in r);
    const failures = results.filter((r) => "error" in r);

    console.log(`\n✅ Spawned ${successes.length} containers successfully.`);
    if (failures.length > 0) {
      console.log(
        `❌ Failed to spawn ${failures.length} containers:`,
        failures,
      );
    }

    console.log(
      `\n⏱️ Total Execution Time: ${((Date.now() - startTime) / 1000).toFixed(2)} seconds`,
    );
    console.log(
      "\nIf you open Docker Desktop or run `docker ps`, you should see the 15 containers executing concurrently. Additionally, monitor Task Manager to see NVIDIA RTX 4060 Ti usage if agents attempt to reach your local LLMs!",
    );
  } catch (err) {
    console.error("FATAL BATCH ERROR", err);
  } finally {
    await stopTracing();
  }
}

main();
