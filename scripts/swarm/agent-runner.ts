import {
  GoogleGenerativeAI,
  SchemaType,
  ChatSession,
} from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { trace, context, propagation } from "@opentelemetry/api";
import { startTracing, stopTracing, getTracer } from "./tracing";
import http from "http";
import {
  shareTaskContext,
  shareDiscovery,
  shareDecision,
  markTaskComplete,
  storeEntity,
  addObservations,
  createRelation,
} from "./shared-memory";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// MCP Integrations State Storage
const mcpClients: Record<string, Client> = {};
const mcpToolDefinitions: any[] = [];
let mcpInitialized = false;

function translateWindowsPathToLinux(winPath: string): string {
  if (!winPath) return winPath;
  return winPath
    .replace(/[Cc]:[/\\]+[Uu]sers[/\\]+[^/\\]+[/\\]+repos[/\\]+hlbw-ai-hub/gi, "/workspace")
    .replace(/[/\\]+/g, "/");
}

async function initializeMCPServers() {
  const category = process.env.AGENT_CATEGORY || "default";
  let configPath = `/etc/mcp_configs/${category}/mcp_config.json`;
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
    configPath = `/etc/mcp_configs/category-${category.replace("_", "-")}/mcp_config.json`;
  }

  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
    console.warn(`[A2A][MCP] No config found at ${configPath}. Starting with base tools only.`);
    return;
  }

  try {
    const configRaw = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(configRaw);
    const mcpServers = (config as any).mcpServers;
    if (mcpServers) {
      const initPromises = Object.entries(mcpServers).map(async ([serverName, serverOpts]: [string, any]) => {
        try {
          console.log(`[A2A][MCP] Booting persistent Transport for ${serverName}...`);
          const command = serverOpts.command === "node.exe" || serverOpts.command.includes("node") ? "node" : serverOpts.command;
          
          let args = serverOpts.args || [];
          if (command === "node") {
             args = args.map((arg: string) => translateWindowsPathToLinux(arg));
          }

          let client: any = null;
          let connected = false;
          let lastErr;
          
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const currentTransport = new StdioClientTransport({
                command,
                args,
                env: { ...process.env, ...serverOpts.env, NODE_PATH: "/workspace/node_modules" }
              });

              client = new Client({ name: "swarm-runner", version: "1.0.0" }, { capabilities: {} });
              
              await client.connect(currentTransport);
              connected = true;
              break;
            } catch (err: any) {
              lastErr = err;
              if (client) {
                try { await client.close(); } catch (_) { /* ignore */ }
              }
              console.warn(`[A2A][MCP] Attempt ${attempt} failed to connect server ${serverName}: ${err.message}. Retrying...`);
              await new Promise(r => setTimeout(r, 2000));
            }
          }

          if (!connected || !client) throw lastErr;
          
          mcpClients[serverName] = client;
          
          // Expose tools
          const { tools } = await client.listTools();
          console.log(`[A2A][MCP] ${serverName} connected with ${tools.length} tools.`);
          
          for (const tool of tools) {
             mcpToolDefinitions.push({
               name: tool.name.replace(/-/g, "_"), // Gemini requires names to match ^[a-zA-Z0-9_]*$
               description: tool.description?.slice(0, 1024) || "No description provided",
               parameters: tool.inputSchema as any // Raw JSON schema compatibility
             });
          }
        } catch (error: any) {
          console.error(`[A2A][MCP] Failed to connect server ${serverName} after 3 attempts: ${error.message}`);
        }
      });

      await Promise.all(initPromises);
    }
  } catch (err: any) {
    console.error(`[A2A][MCP] Error reading config:`, err.message);
  }
}


const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY");
  process.exit(1);
}

startTracing();
const genAI = new GoogleGenerativeAI(API_KEY);

// Persistent sessions memory
const sessions: Record<string, ChatSession> = {};

function clear_context(sessionId: string) {
  delete sessions[sessionId];
  console.log(`[A2A] Session context ${sessionId} purged.`);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/a2a") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const taskId = payload.task_id;
        const sessionId = payload.session_id || taskId;
        let instruction = payload.message;
        // In the container, all worktrees are at /hlbw-worktrees/
        const folderName = payload.context?.worktree;
        const worktreePath = folderName
          ? `/hlbw-worktrees/${folderName}`
          : "/workspace";

        const isPersistent = payload.context?.persistence_mode === "persistent";
        const category = payload.context?.category || "default";

        console.log(
          `[A2A] Received task ${taskId} for session ${sessionId} (Category: ${category})`,
        );

        // --- IMMEDIATE HEARTBEAT ---
        await storeEntity(`task:${taskId}`, "swarm_task", [
          `Status: executing`,
          `StartedAt: ${new Date().toISOString()}`,
          `Node: ${process.env.WARM_POOL_ID || "unknown"}`,
        ]);

        // Wrap execution in an OTEL span
        getTracer().startActiveSpan(`a2a-task-${taskId}`, async (span) => {
          span.setAttribute("task_id", taskId);
          span.setAttribute("session_id", sessionId);
          span.setAttribute("category", category);

          // --- SENTRY VALIDATION ---
          console.log(
            "Validating instruction via Directive Enforcer Sentry...",
          );
          await getTracer().startActiveSpan(
            `sentry-validation-request`,
            async (sentrySpan) => {
              try {
                const sentryPayload = JSON.stringify({
                  sender_id: "agent-runner",
                  target_id: "directive-enforcer",
                  payload: {
                    action: "get_advice",
                    draft_instruction: instruction,
                  },
                });

                const sentryUrl = new URL(
                  process.env.SENTRY_ENFORCER_URL ||
                    "http://localhost:8080/a2a/message",
                );

                const adviceResponse = await new Promise<string>(
                  (resolve, reject) => {
                    const req = http.request(
                      {
                        hostname: sentryUrl.hostname,
                        port: sentryUrl.port,
                        path: sentryUrl.pathname,
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "Content-Length": Buffer.byteLength(sentryPayload),
                        },
                        timeout: 5000,
                      },
                      (res) => {
                        let body = "";
                        res.on("data", (d) => (body += d));
                        res.on("end", () => {
                          if (res.statusCode === 200) resolve(body);
                          else
                            reject(
                              new Error(
                                `Sentry returned status ${res.statusCode}`,
                              ),
                            );
                        });
                      },
                    );
                    req.on("error", reject);
                    req.write(sentryPayload);
                    req.end();
                  },
                );

                if (adviceResponse) {
                  const advice = JSON.parse(adviceResponse);
                  if (advice.response_payload?.advice) {
                    console.log(
                      `\x1b[33m[SENTRY ADVICE RECEIVED]\x1b[0m\n${advice.response_payload.advice}\n`,
                    );
                    instruction += `\n\nIMPORTANT ARCHITECTURAL ADVICE FROM SENTRY:\n${advice.response_payload.advice}`;
                    sentrySpan.setAttribute("sentry.advice", true);
                  }
                }
              } catch (e: any) {
                console.warn(
                  "\x1b[31m[Warning]\x1b[0m Sentry unreachable or validation failed.",
                );
                sentrySpan.recordException(e);
                sentrySpan.setAttribute("error", true);
              } finally {
                sentrySpan.end();
              }
            },
          );

          const tools: any[] = [
            {
              name: "read_file",
              description: "Reads the content of a file",
              parameters: {
                type: SchemaType.OBJECT,
                properties: { filePath: { type: SchemaType.STRING } },
                required: ["filePath"],
              },
            },
            {
              name: "write_file",
              description: "Writes content to a file",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  filePath: { type: SchemaType.STRING },
                  content: { type: SchemaType.STRING },
                },
                required: ["filePath", "content"],
              },
            },
            {
              name: "exec_command",
              description: "Executes a shell command (e.g. ls, grep, find)",
              parameters: {
                type: SchemaType.OBJECT,
                properties: { command: { type: SchemaType.STRING } },
                required: ["command"],
              },
            },
            {
              name: "ollama_generate",
              description: "Direct GPU inference for acceleration",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  model: { type: SchemaType.STRING },
                  prompt: { type: SchemaType.STRING },
                },
                required: ["model", "prompt"],
              },
            },
            {
              name: "store_memory",
              description:
                "Stores a knowledge fragment into the shared swarm memory.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  name: {
                    type: SchemaType.STRING,
                    description: "Unique name for this memory fragment",
                  },
                  type: {
                    type: SchemaType.STRING,
                    enum: [
                      "swarm_discovery",
                      "swarm_decision",
                      "swarm_context",
                    ],
                  },
                  observations: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                  },
                },
                required: ["name", "type", "observations"],
              },
            },
            {
              name: "create_memory_relation",
              description:
                "Creates a relationship between two existing memory fragments.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  source: { type: SchemaType.STRING },
                  target: { type: SchemaType.STRING },
                  relationType: { type: SchemaType.STRING },
                },
                required: ["source", "target", "relationType"],
              },
            },
          ];

          // Safely merge dynamically loaded MCP capabilities!
          const allTools = [...tools, ...mcpToolDefinitions];

          const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: `You are an autonomous AI swarm worker inside an isolated repository worktree: ${worktreePath}. Execute your instruction and write output. Say DONE when finished.
              
              CRITICAL: You MUST use the 'store_memory' and 'create_memory_relation' tools to document important discoveries, decisions, or architectural findings into the shared knowledge graph. This allows other agents to build upon your work.`,
            tools: [{ functionDeclarations: allTools }],
          });

          let chat = sessions[sessionId];
          if (!chat) {
            chat = model.startChat({});
            if (isPersistent) sessions[sessionId] = chat;
          }

          let nextPrompt: string | Array<any> =
            `Execute this instruction:\n\n${instruction}\n\nSay DONE when finished.`;
          let resultText = "";

          for (let i = 0; i < 30; i++) {
            let response: any;
            await getTracer().startActiveSpan(
              `llm-turn-${i}`,
              async (llmSpan) => {
                response = await chat.sendMessage(nextPrompt);
                llmSpan.end();
              },
            );

            const text = response.response.text();
            if (text) {
              console.log(`AGENT[${taskId}]: ${text}`);
              resultText += text + "\n";
            }
            if (text.includes("DONE")) break;

            const functionCalls = response.response.functionCalls();
            if (!functionCalls || functionCalls.length === 0) {
              nextPrompt = "Please continue or say DONE.";
              continue;
            }

            const toolResponses: any[] = [];
            for (const call of functionCalls) {
              const args = call.args as Record<string, any>;
              const absPath = path.isAbsolute(args.filePath || "")
                ? args.filePath
                : path.join(worktreePath, args.filePath || "");

              try {
                if (call.name === "read_file") {
                  const content = fs.readFileSync(absPath, "utf8");
                  toolResponses.push({
                    functionResponse: {
                      name: call.name,
                      response: { content: content.slice(0, 10000) },
                    },
                  });
                } else if (call.name === "write_file") {
                  fs.mkdirSync(path.dirname(absPath), { recursive: true });
                  fs.writeFileSync(absPath, args.content, "utf8");
                  toolResponses.push({
                    functionResponse: {
                      name: call.name,
                      response: { success: true },
                    },
                  });
                } else if (call.name === "exec_command") {
                  const out = execSync(args.command, {
                    cwd: worktreePath,
                    encoding: "utf8",
                  });
                  toolResponses.push({
                    functionResponse: {
                      name: call.name,
                      response: { output: out.slice(0, 10000) },
                    },
                  });
                } else if (call.name === "ollama_generate") {
                  const res = await fetch(
                    `http://host.docker.internal:11434/api/generate`,
                    {
                      method: "POST",
                      body: JSON.stringify({
                        model: args.model,
                        prompt: args.prompt,
                        stream: false,
                      }),
                    },
                  );
                  const data = (await res.json()) as any;
                  toolResponses.push({
                    functionResponse: {
                      name: call.name,
                      response: { output: data.response },
                    },
                  });
                } else if (call.name === "store_memory") {
                  await storeEntity(args.name, args.type, args.observations);
                  toolResponses.push({
                    functionResponse: {
                      name: call.name,
                      response: { success: true },
                    },
                  });
                } else if (call.name === "create_memory_relation") {
                  await createRelation(
                    args.source,
                    args.target,
                    args.relationType,
                  );
                  toolResponses.push({
                    functionResponse: {
                      name: call.name,
                      response: { success: true },
                    },
                  });
                } else {
                  // Must be an MCP Server Tool.
                  const originalToolName = call.name.replace(/_/g, "-");
                  
                  // Find the Client that handles this.
                  let handled = false;
                  for (const [serverName, client] of Object.entries(mcpClients)) {
                    // Ask the specific client if it can handle it (we assume unique tool names or we hit the first matching)
                    try {
                      // Attempt to call the MCP tool.
                      const result = await client.callTool({
                        name: originalToolName, // Try dashed name first
                        arguments: args
                      });
                      toolResponses.push({
                         functionResponse: {
                           name: call.name, // Return original name so Gemini matches it
                           response: { result: result.content }
                         }
                      });
                      handled = true;
                      break;
                    } catch (e: any) {
                       // Try snakecase name literally just in case
                       try {
                         const result = await client.callTool({ name: call.name, arguments: args });
                         toolResponses.push({
                            functionResponse: { name: call.name, response: { result: result.content } }
                         });
                         handled = true;
                         break;
                       } catch (e2) {
                         continue; // Not this client
                       }
                    }
                  }
                  
                  if (!handled) {
                     throw new Error(`Tool ${call.name} not found in base list or MCP registry.`);
                  }
                }
              } catch (err: any) {
                toolResponses.push({
                  functionResponse: {
                    name: call.name,
                    response: { error: err.message },
                  },
                });
              }
            }
            nextPrompt = toolResponses;
          }

          if (!isPersistent) clear_context(sessionId);

          const a2aResponse = {
            version: "1.0",
            task_id: taskId,
            status: "success",
            result: { output: resultText },
          };

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(a2aResponse));
          span.end();
        });
      } catch (e: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

const PORT = 8000;

initializeMCPServers().then(() => {
  mcpInitialized = true;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[A2A] Persistent Role-Based Worker listening on port ${PORT} (Category: ${process.env.AGENT_CATEGORY || "default"})`);
  });
}).catch(err => {
  console.error("Failed to initialize system:", err);
  process.exit(1);
});
