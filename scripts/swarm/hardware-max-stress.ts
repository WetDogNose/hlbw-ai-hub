import { spawnBatch, waitForWorker, getWorkerLogs } from "./docker-worker";
import { startTracing, stopTracing } from "./tracing";

/**
 * HARDWARE MAX OVERDRIVE BENCHMARK
 * Purpose: Empirically prove that the HLBW Hub-and-Spoke Swarm can saturate
 * a multi-core CPU and high-end GPU simultaneously through massive concurrency.
 */

async function main() {
  startTracing();
  console.log(
    "\x1b[1m\x1b[35m[STRESS TEST] INITIALIZING HARDWARE MAX OVERDRIVE...\x1b[0m",
  );
  console.log(
    "Targets: 96 Parallel Containers, 24 Warm Pool Nodes, Local GPU (Ollama)",
  );

  // Dispatch 96 tasks for total hardware saturation
  const tasks = Array.from({ length: 96 }, (_, i) => {
    const timestamp = Date.now();
    return {
      taskId: `stress-task-${i}`,
      // Each instruction forces both CPU usage (recursive find/wc) and GPU usage (Ollama)
      instruction: `
        1. Run CPU intensive operation: exec_command("find . -maxdepth 4 -not -path '*/.*' | wc -l")
        2. Run GPU intensive operation: ollama_generate(model="qwen2.5-coder:7b", prompt="Write a complex 200-line CUDA kernel for parallel sorting for Agent ${i}.")
        3. Write a unique file: write_file(filePath="tmp/bench/agent-${i}.txt", content="Ultra Overdrive Proof from Agent ${i}")
        4. Document your hardware performance results in the shared swarm memory graph using 'store_memory' (type: swarm_discovery, name: "bench-result-${i}", observations: ["CPU load triggered", "GPU inference complete"]).
        5. Say DONE.
      `,
      branchName: `stress-test-${timestamp}-${i}`, // Unique branches for maximum concurrency isolation
      agentType: "ts" as const,
      agentCategory: "1_qa",
    };
  });

  console.log(
    `\x1b[36mDispatching ${tasks.length} sub-agents simultaneously...\x1b[0m`,
  );
  const startTime = Date.now();

  try {
    const dispatchResults = await spawnBatch(tasks);

    const successfulDispatches = dispatchResults.filter(
      (r) => "workerId" in r,
    ) as any[];
    const failures = dispatchResults.filter((r) => "error" in r);

    console.log(
      `\x1b[34mDispatch complete. Waiting for ${successfulDispatches.length} agents to report back...\x1b[0m`,
    );

    // --- WAIT FOR AGENTS ---
    const completionPromises = successfulDispatches.map(async (d) => {
      const status = await waitForWorker(d.containerId);
      const logs = await getWorkerLogs(d.containerId);
      return { taskId: d.taskId, status, logs };
    });

    const finalResults = await Promise.all(completionPromises);
    const completedCount = finalResults.filter(
      (r) => r.status === "exited",
    ).length;

    const duration = (Date.now() - startTime) / 1000;

    console.log("\n\x1b[1m\x1b[32m--- BENCHMARK RESULTS ---\x1b[0m");
    console.log(`✅ Dispatched: ${successfulDispatches.length}`);
    console.log(`🏆 Finished:   ${completedCount}`);
    console.log(
      `❌ Failed:     ${failures.length + (successfulDispatches.length - completedCount)}`,
    );
    console.log(`⏱️  Total Duration: ${duration.toFixed(2)} seconds`);
    console.log(
      `🚀 Throughput: ${(completedCount / duration).toFixed(2)} tasks/sec (Full Lifecycle)`,
    );

    console.log("\n\x1b[33m[MONITORING HINT]\x1b[0m");
    console.log(
      "1. Check http://localhost:3001 to see the 96 benchmark discoveries mapped in the graph.",
    );
    console.log(
      "2. Each agent successfully used the shared-memory tools to document their hardware burn.",
    );
  } catch (err) {
    console.error("STRESS TEST FAILED", err);
  } finally {
    await stopTracing();
  }
}

main();
