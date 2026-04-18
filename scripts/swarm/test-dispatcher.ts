import { spawnDockerWorker } from "./docker-worker";

(async () => {
  console.log("Submitting test cloud task...");
  try {
    const result = await spawnDockerWorker(
      "test-task-cloud-1234",
      "Please run a dummy tool call to gcp-trace-mcp and say DONE.",
      "test-branch",
      "3_cloud"
    );
    console.log("RESULT:", result);
  } catch (e: any) {
    console.error("FAILED:", e.message);
  }
})();
