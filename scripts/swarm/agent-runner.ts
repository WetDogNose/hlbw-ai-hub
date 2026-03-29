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
        const sessionId = payload.session_id || taskId; // use task id if no session provided
        let instruction = payload.message;
        const worktreePath = payload.context?.worktree || "/workspace";
        const isPersistent = payload.context?.persistence_mode === "persistent";

        console.log(`[A2A] Received task ${taskId} for session ${sessionId}`);

        // Change directory to the requested worktree
        try {
          process.chdir(worktreePath);
          console.log(`[A2A] Changed working directory to ${worktreePath}`);
        } catch (e) {
          console.warn(`[A2A] Could not chdir to ${worktreePath}`, e);
        }

        // --- SENTRY VALIDATION ---
        console.log("Validating instruction via Directive Enforcer Sentry...");
        try {
          const b64 = Buffer.from(
            JSON.stringify({
              sender_id: "agent-runner",
              target_id: "directive-enforcer",
              payload: { action: "get_advice", draft_instruction: instruction },
            }),
          ).toString("base64");
          const script = `
              const http = require('http');
              const data = Buffer.from('${b64}', 'base64').toString();
              const req = http.request('http://localhost:8080/a2a/message', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
                  timeout: 5000
              }, (res) => {
                  let body = '';
                  res.on('data', d => body += d);
                  res.on('end', () => {
                      if (res.statusCode === 200) {
                          const json = JSON.parse(body);
                          console.log(JSON.stringify(json.response_payload));
                          process.exit(0);
                      } else process.exit(1);
                  });
              });
              req.on('error', () => process.exit(1));
              req.write(data);
              req.end();
          `;
          const adviceJson = execSync(`node -e "${script}"`, {
            encoding: "utf-8",
          }).trim();
          if (adviceJson) {
            const advice = JSON.parse(adviceJson);
            if (advice.advice) {
              console.log(
                `\x1b[33m[SENTRY ADVICE RECEIVED]\x1b[0m\n${advice.advice}\n`,
              );
              instruction += `\n\nIMPORTANT ARCHITECTURAL ADVICE FROM SENTRY:\n${advice.advice}`;
            }
          }
        } catch (e) {
          console.warn(
            "\x1b[31m[Warning]\x1b[0m Sentry unreachable or validation failed.",
          );
        }

        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          systemInstruction:
            "You are an autonomous AI swarm worker inside an isolated repository worktree. You have access to bash commands, file reading, and file writing. Execute your assigned instruction and write your output to the required location. When you are completely finished, output the exact word 'DONE'. Use tools to discover codebase context before acting. Always use paths relative to your current working directory.",
          tools: [
            {
              functionDeclarations: [
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
              ],
            },
          ],
        });

        // Use existing session if persistent, else create one
        let chat = sessions[sessionId];
        if (!chat) {
          chat = model.startChat({});
          if (isPersistent) {
            sessions[sessionId] = chat;
          }
        }

        let nextPrompt: string | Array<any> =
          `Execute this instruction:\n\n${instruction}\n\nUse your tools to explore and write the requested report. Say DONE when finished.`;
        let resultText = "";

        for (let i = 0; i < 30; i++) {
          const response = await chat.sendMessage(nextPrompt);
          const text = response.response.text();
          if (text) {
            console.log(`AGENT: ${text}`);
            resultText += text + "\n";
          }
          if (text.includes("DONE")) {
            console.log("Agent finished successfully.");
            break;
          }

          const functionCalls = response.response.functionCalls();
          if (!functionCalls || functionCalls.length === 0) {
            nextPrompt =
              "Please continue working or output exactly 'DONE' if you are completely finished.";
            continue;
          }

          const toolResponses: any[] = [];
          for (const call of functionCalls) {
            const args = call.args as Record<string, any>;
            console.log(`> CALLING TOOL: ${call.name}`);
            try {
              if (call.name === "read_file") {
                const content = fs.readFileSync(args.filePath, "utf8");
                toolResponses.push({
                  functionResponse: {
                    name: call.name,
                    response: { content: content.slice(0, 20000) },
                  },
                });
              } else if (call.name === "write_file") {
                fs.mkdirSync(path.dirname(args.filePath), { recursive: true });
                fs.writeFileSync(args.filePath, args.content, "utf8");
                toolResponses.push({
                  functionResponse: {
                    name: call.name,
                    response: { success: true },
                  },
                });
              } else if (call.name === "exec_command") {
                try {
                  const output = execSync(args.command, { encoding: "utf8" });
                  toolResponses.push({
                    functionResponse: {
                      name: call.name,
                      response: { output: output.slice(0, 20000) },
                    },
                  });
                } catch (execErr: any) {
                  toolResponses.push({
                    functionResponse: {
                      name: call.name,
                      response: { error: execErr.message },
                    },
                  });
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

        if (!isPersistent) {
          clear_context(sessionId);
        }

        const a2aResponse = {
          version: "1.0",
          task_id: taskId,
          status: "success",
          result: {
            output: resultText,
          },
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(a2aResponse));
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
server.listen(PORT, "0.0.0.0", () => {
  console.log(`[A2A] Node.js Straight Worker listening on port ${PORT}`);
});
