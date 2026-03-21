import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import { addWorker, updateTaskStatus, updateWorkerStatus } from "./state-manager";
import { TaskStatus, WorkerStatus } from "./types";
import { createWorktree } from "./manage-worktree";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getTracer, startTracing, stopTracing } from "./tracing";
import { SWARM_POLICY } from "./policy";
import { appendAudit } from "./audit";
import { propagation, context } from "@opentelemetry/api";

async function getMcpClient() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.resolve(process.cwd(), ".agents", "mcp-servers", "docker-manager-mcp", "build", "index.js")],
  });
  const client = new Client(
    { name: "docker-worker-client", version: "1.0.0" },
    { capabilities: {} }
  );
  await client.connect(transport);
  return client;
}

// --- Core Spawn ---

export async function spawnDockerWorker(taskId: string, instructionPayload: string, branchName: string) {
  const tracer = getTracer();
  return tracer.startActiveSpan("DockerWorker:spawn", async (span) => {
    span.setAttribute("task.id", taskId);
    span.setAttribute("branch.name", branchName);

    let client: Client | null = null;
    try {
      const worktreePath = createWorktree(branchName);
      const absoluteWorktreePath = path.resolve(worktreePath);
      const hostAuditDir = path.resolve(process.cwd(), ".agents", "swarm");

      const worker = await addWorker({
        taskId,
        provider: SWARM_POLICY.defaultProvider,
        modelId: SWARM_POLICY.defaultModel,
        status: WorkerStatus.Starting,
        metadata: { instructionPayload, branchName },
      });

      await updateTaskStatus(taskId, TaskStatus.InProgress, "docker-worker");

      span.setAttribute("worker.id", worker.id);
      console.log(`Spawning docker worker ${worker.id} for task ${taskId}...`);

      client = await getMcpClient();

      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);

      const envKeys: Record<string, string> = {};
      if (process.env.GEMINI_API_KEY) envKeys.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (carrier.traceparent) envKeys.TRACEPARENT = carrier.traceparent;
      if (carrier.tracestate) envKeys.TRACESTATE = carrier.tracestate;

      const response = await client.callTool({
        name: "run_container",
        arguments: {
          imageName: "wot-box-worker:latest",
          mountVolume: absoluteWorktreePath,
          envKeys: envKeys,
          command: ["npx", "tsx", "scripts/swarm/agent-runner.ts", instructionPayload],
          extraBinds: [`${hostAuditDir}:/workspace/.agents/swarm`]
        }
      });

      const containerId = (response as any).content[0].text;
      span.setAttribute("container.id", containerId);
      console.log(`Successfully spawned container ${containerId} via Docker MCP.`);

      // Update worker with container id and running status
      await updateWorkerStatus(worker.id, WorkerStatus.Running, { runtimeId: containerId });

      console.log(`Worker ${worker.id} running in container ${containerId}.`);
      return { workerId: worker.id, containerId };
    } catch (err: any) {
      span.recordException(err);
      console.error(`Failed to spawn worker for task ${taskId}:`, err);
      await updateTaskStatus(taskId, TaskStatus.Failed, "docker-worker");
      throw err;
    } finally {
      if (client) await client.close();
      span.end();
    }
  });
}

// --- Gap 2: Batch Spawn ---

export interface BatchSpawnRequest {
  taskId: string;
  instruction: string;
  branchName: string;
}

export async function spawnBatch(requests: BatchSpawnRequest[]): Promise<Array<{ workerId: string; containerId: string } | { error: string }>> {
  const tracer = getTracer();
  return tracer.startActiveSpan("DockerWorker:spawnBatch", async (span) => {
    span.setAttribute("batch.size", requests.length);

    const results: Array<{ workerId: string; containerId: string } | { error: string }> = [];
    const promises = requests.map(async (req) => {
      try {
        const result = await spawnDockerWorker(req.taskId, req.instruction, req.branchName);
        return result;
      } catch (err: any) {
        return { error: err.message };
      }
    });

    const settled = await Promise.allSettled(promises);
    for (const s of settled) {
      if (s.status === "fulfilled") {
        results.push(s.value);
      } else {
        results.push({ error: s.reason?.message || "Unknown error" });
      }
    }

    await appendAudit({
      actor: "docker-worker",
      action: "worker.batch_spawned",
      entityType: "worker",
      entityId: "batch",
      metadata: { count: requests.length, successes: results.filter((r) => "workerId" in r).length },
    });

    span.setAttribute("batch.successes", results.filter((r) => "workerId" in r).length);
    span.end();
    return results;
  });
}

// --- Gap 2: Get Worker Logs ---

export async function getWorkerLogs(containerId: string): Promise<string> {
  let client: Client | null = null;
  try {
    client = await getMcpClient();
    const response = await client.callTool({
      name: "get_container_logs",
      arguments: { containerId },
    });
    return (response as any).content[0].text || "";
  } catch (err: any) {
    return `Error fetching logs: ${err.message}`;
  } finally {
    if (client) await client.close();
  }
}

// --- Gap 2: Wait For Worker ---

export async function waitForWorker(containerId: string, pollIntervalMs = 5000, timeoutMs?: number): Promise<string> {
  const start = Date.now();
  const timeout = timeoutMs || SWARM_POLICY.workerTimeoutMinutes * 60 * 1000;

  while (true) {
    let client: Client | null = null;
    try {
      client = await getMcpClient();
      const response = await client.callTool({
        name: "get_container_status",
        arguments: { containerId },
      });
      const statusText = (response as any).content[0].text?.toLowerCase() || "";
      if (statusText.includes("exited") || statusText.includes("stopped") || statusText.includes("dead")) {
        return statusText;
      }
    } catch (err: any) {
      // Container removed or MCP error
      return "error";
    } finally {
      if (client) await client.close();
    }

    if (Date.now() - start > timeout) {
      return "timeout";
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

// --- Gap 2: Stop Worker ---

export async function stopWorker(containerId: string): Promise<void> {
  let client: Client | null = null;
  try {
    client = await getMcpClient();
    await client.callTool({
      name: "stop_container",
      arguments: { containerId },
    });
    console.log(`Stopped container ${containerId}.`);
  } finally {
    if (client) await client.close();
  }
}

// CLI usage
if (require.main === module) {
  startTracing();
  const cmd = process.argv[2];

  if (cmd === "spawn") {
    const taskId = process.argv[3];
    const branchName = process.argv[4];
    const instruction = process.argv[5];
    if (!taskId || !branchName || !instruction) {
      console.error("Usage: tsx docker-worker.ts spawn <taskId> <branchName> <instruction>");
      stopTracing();
      process.exit(1);
    }
    spawnDockerWorker(taskId, instruction, branchName)
      .then((r) => console.log(JSON.stringify(r, null, 2)))
      .catch(console.error)
      .finally(() => stopTracing());
  } else if (cmd === "logs") {
    const containerId = process.argv[3];
    if (!containerId) { console.error("Usage: tsx docker-worker.ts logs <containerId>"); process.exit(1); }
    getWorkerLogs(containerId)
      .then(console.log)
      .finally(() => stopTracing());
  } else if (cmd === "wait") {
    const containerId = process.argv[3];
    if (!containerId) { console.error("Usage: tsx docker-worker.ts wait <containerId>"); process.exit(1); }
    waitForWorker(containerId)
      .then((s) => console.log(`Final status: ${s}`))
      .finally(() => stopTracing());
  } else if (cmd === "stop") {
    const containerId = process.argv[3];
    if (!containerId) { console.error("Usage: tsx docker-worker.ts stop <containerId>"); process.exit(1); }
    stopWorker(containerId)
      .catch(console.error)
      .finally(() => stopTracing());
  } else {
    // Legacy CLI compat
    const taskId = process.argv[2];
    const branchName = process.argv[3];
    const instruction = process.argv[4];
    if (taskId && branchName && instruction) {
      spawnDockerWorker(taskId, instruction, branchName)
        .catch(console.error)
        .finally(() => stopTracing());
    } else {
      console.error("Usage: tsx docker-worker.ts [spawn|logs|wait|stop] ...");
      stopTracing();
    }
  }
}
