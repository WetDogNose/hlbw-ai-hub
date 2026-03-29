import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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
    { name: "demo-manager", version: "1.0.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}

async function runDemo() {
  console.log("[Demo] Booting V3 Warm Pool with 3 distinct persisted workers...");
  const client = await getMcpClient();
  const absoluteRoot = process.cwd();

  const configsPath = path.resolve(absoluteRoot, "tools/docker-gemini-cli/configs");
  
  const envKeys = {
    A2A_MODE: "true",
    OTEL_EXPORTER_OTLP_ENDPOINT: "http://host.docker.internal:4318/v1/traces",
    SENTRY_ENFORCER_URL: "http://host.docker.internal:8080/a2a/message"
  };
  if (process.env.GEMINI_API_KEY) {
     envKeys.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  }

  const parentDir = path.resolve(absoluteRoot, "..");
  const sharedExtraBinds = [
    `${configsPath}:/etc/mcp_configs:ro`,
    `${path.join(parentDir, "wot-box")}:/wot-box`,
    `${path.join(parentDir, "genkit")}:/genkit`,
    `${path.join(parentDir, "adk-python")}:/adk-python`,
    `${path.join(parentDir, "adk-js")}:/adk-js`,
    `${path.join(parentDir, "hlbw-home-assistant")}:/hlbw-home-assistant`
  ];

  // 1. Straight Node Worker
  try {
    console.log("[Demo] Starting hlbw-swarm-worker (Node)...");
    const nodeEnv = { ...envKeys, WARM_POOL_ID: "demo-node-1" };
    const resNode = await client.callTool({
      name: "run_container",
      arguments: {
        imageName: "hlbw-swarm-worker:latest",
        mountVolume: absoluteRoot,
        envKeys: nodeEnv,
        extraBinds: sharedExtraBinds,
        command: ["npx", "tsx", "scripts/swarm/agent-runner.ts"]
      },
    });
    console.log(`[Demo] Node Worker Started - ID: ${(resNode).content[0].text}`);
  } catch (err) {
    console.error("[Demo] Node worker error:", err.message);
  }

  // 2. Straight Python Worker
  try {
    console.log("[Demo] Starting hlbw-python-worker (Python)...");
    const pyEnv = { ...envKeys, WARM_POOL_ID: "demo-python-1" };
    const resPy = await client.callTool({
      name: "run_container",
      arguments: {
        imageName: "hlbw-python-worker:latest",
        mountVolume: absoluteRoot,
        envKeys: pyEnv,
        extraBinds: sharedExtraBinds,
        command: ["python", "scripts/swarm/python-a2a-worker.py"]
      },
    });
    console.log(`[Demo] Python Worker Started - ID: ${(resPy).content[0].text}`);
  } catch (err) {
    console.error("[Demo] Python worker error:", err.message);
  }

  // 3. Fat Worker (Gemini CLI)
  try {
    console.log("[Demo] Starting gemini-cli-image (Fat Container)...");
    const fatEnv = { ...envKeys, WARM_POOL_ID: "demo-fat-1" };
    
    const resFat = await client.callTool({
      name: "run_container",
      arguments: {
        imageName: "gemini-cli-image:latest",
        mountVolume: absoluteRoot,
        envKeys: fatEnv,
        // Let Docker use the ENTRYPOINT default by not providing override commands
        command: [],
        extraBinds: sharedExtraBinds,
      },
    });
    console.log(`[Demo] Fat Worker Started - ID: ${(resFat).content[0].text}`);
  } catch (err) {
    console.error("[Demo] Fat worker error:", err.message);
  }

  await client.close();
  console.log("[Demo] All persisted workers requested successfully.");
}

runDemo().catch(console.error);
