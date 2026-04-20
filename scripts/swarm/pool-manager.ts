import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import prisma from "@/lib/prisma";
import { resumeIssue } from "./resume-worker";

/**
 * V3 SWARM WARM POOL MANAGER
 * Initializes and manages a fleet of long-running Docker containers on the local hlbw-network.
 * Workers await A2A task assignment payloads over HTTP, instead of spinning up/down per task.
 */

export interface PoolConfig {
  workerCount: number;
}

async function getMcpClient() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [
      path.resolve(
        process.cwd(),
        ".agents",
        "mcp-servers",
        "docker-manager-mcp",
        "build",
        "index.js",
      ),
    ],
  });
  const client = new Client(
    { name: "pool-manager", version: "1.0.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}

export async function initializePool(config: PoolConfig = { workerCount: 21 }) {
  console.log(
    `[PoolManager] Booting warm pool with ${config.workerCount} generic straight-workers...`,
  );
  const client = await getMcpClient();
  const absoluteRoot = process.cwd(); // Mount entire root so workers can dynamically `cd` into worktrees

  try {
    const roles = [
      "1_qa",
      "2_source",
      "3_cloud",
      "4_db",
      "5_bizops",
      "6_project",
      "7_automation",
    ];
    const roleCounters: Record<string, number> = {};

    for (let i = 1; i <= config.workerCount; i++) {
      const role = roles[(i - 1) % roles.length];
      roleCounters[role] = (roleCounters[role] || 0) + 1;
      const subIndex = roleCounters[role];
      const containerName = `hlbw-worker-warm-${role}-${subIndex}`;

      console.log(`[PoolManager] Starting ${containerName} (Role: ${role})...`);

      const envKeys: Record<string, string> = {
        WARM_POOL_ID: `pool-node-${i}`,
        A2A_MODE: "true",
        AGENT_CATEGORY: role,
        OTEL_EXPORTER_OTLP_ENDPOINT:
          "http://host.docker.internal:4318/v1/traces",
        SENTRY_ENFORCER_URL: "http://host.docker.internal:8080/a2a/message",
        NODE_PATH: "/workspace/node_modules", // Force container to find host modules
      };

      if (process.env.GEMINI_API_KEY)
        envKeys.GEMINI_API_KEY = process.env.GEMINI_API_KEY;

      const parentDir = path.resolve(absoluteRoot, "..");
      const extraBinds: string[] = [
        // Mount all 6 configs for fast categorization shifting
        `${path.resolve(absoluteRoot, "tools/docker-gemini-cli/configs")}:/etc/mcp_configs:ro`,
        // Cross-Repo Workspace Persisted Storage (VSC Workspace Mappings)
        `${path.join(parentDir, "wot-box")}:/wot-box`,
        `${path.join(parentDir, "genkit")}:/genkit`,
        `${path.join(parentDir, "adk-python")}:/adk-python`,
        `${path.join(parentDir, "adk-js")}:/adk-js`,
        `${path.join(parentDir, "hlbw-home-assistant")}:/hlbw-home-assistant`,
        `${path.join(parentDir, "hlbw-worktrees")}:/hlbw-worktrees`,
      ];

      try {
        const response = await client.callTool({
          name: "run_container",
          arguments: {
            imageName: "hlbw-swarm-worker:latest",
            containerName: containerName,
            // Entire source tree is mounted to /workspace by the MCP tool
            mountVolume: absoluteRoot,
            envKeys: envKeys,
            extraBinds: extraBinds,
            command: ["npx", "tsx", "/workspace/scripts/swarm/agent-runner.ts"],
          },
        });
        const containerId = (response as any).content[0].text;
        console.log(
          `[PoolManager] Started node ${i} - Container ID: ${containerId}`,
        );
      } catch (err: any) {
        console.error(`[PoolManager] Error booting node ${i}:`, err.message);
      }
    }
  } finally {
    await client.close();
  }
}

/**
 * Pass 10 — resume-preference shortcut.
 *
 * Before picking up a new pending `Issue`, ask the graph state table for
 * any row with status in { 'paused', 'interrupted' }. If one exists,
 * resume it (via the same spawn pattern docker-worker uses for a fresh
 * start, just without `graph.start()`). Callers who find `null` should
 * fall through to the normal Postgres-backed arbiter.
 *
 * Exported so `arbiter.ts` / dispatcher / future scheduling code can
 * preempt the queue with a resumable task.
 */
export async function pickNextResumable(): Promise<string | null> {
  const row = await prisma.taskGraphState.findFirst({
    where: { status: { in: ["paused", "interrupted"] } },
    orderBy: { lastTransitionAt: "asc" },
    select: { issueId: true },
  });
  if (!row) return null;
  await resumeIssue(row.issueId, { spawn: true });
  return row.issueId;
}

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === "start") {
    const count = parseInt(process.argv[3] || "21");
    initializePool({ workerCount: count }).then(() =>
      console.log("Pool initialized."),
    );
  } else if (cmd === "resume-next") {
    pickNextResumable()
      .then((id) => {
        if (id) console.log(`[pool-manager] resumed ${id}`);
        else console.log("[pool-manager] no resumable rows.");
      })
      .catch((err) => {
        console.error("[pool-manager] resume-next failed:", err);
        process.exit(1);
      });
  }
}
