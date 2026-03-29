import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SWARM_POLICY } from "./policy";

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

export async function initializePool(config: PoolConfig = { workerCount: 4 }) {
  console.log(
    `[PoolManager] Booting warm pool with ${config.workerCount} generic straight-workers...`,
  );
  const client = await getMcpClient();
  const absoluteRoot = process.cwd(); // Mount entire root so workers can dynamically `cd` into worktrees

  try {
    for (let i = 1; i <= config.workerCount; i++) {
      const containerName = `hlbw-worker-warm-${i}`;
      console.log(`[PoolManager] Starting ${containerName}...`);

      const envKeys: Record<string, string> = {
        WARM_POOL_ID: `pool-node-${i}`,
        A2A_MODE: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT:
          "http://host.docker.internal:4318/v1/traces",
        SENTRY_ENFORCER_URL: "http://host.docker.internal:8080/a2a/message",
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
      ];

      try {
        const response = await client.callTool({
          name: "run_container",
          arguments: {
            imageName: "hlbw-swarm-worker:latest",
            // Entire source tree is mounted, listener determines specific task worktree path
            mountVolume: absoluteRoot,
            envKeys: envKeys,
            extraBinds: extraBinds,
            command: ["npx", "tsx", "scripts/swarm/agent-runner.ts"],
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

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === "start") {
    const count = parseInt(process.argv[3] || "4");
    initializePool({ workerCount: count }).then(() =>
      console.log("Pool initialized."),
    );
  }
}
