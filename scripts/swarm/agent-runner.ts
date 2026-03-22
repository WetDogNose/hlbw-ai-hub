import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { trace, context, propagation } from "@opentelemetry/api";
import { startTracing, stopTracing, getTracer } from "./tracing";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY");
  process.exit(1);
}

startTracing();

const genAI = new GoogleGenerativeAI(API_KEY);
let instruction = process.argv[2];

if (!instruction) {
  console.error("Missing instruction payload");
  process.exit(1);
}

async function run() {
  const activeContext = propagation.extract(context.active(), process.env);
  const tracer = getTracer("agent-runner");

  await tracer.startActiveSpan(
    "Agent:Lifecycle",
    {},
    activeContext,
    async (rootSpan) => {
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

        // Use a 5s timeout for Sentry
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
            // Append advice to instruction for the agent
            instruction += `\n\nIMPORTANT ARCHITECTURAL ADVICE FROM SENTRY:\n${advice.advice}`;
          }
        }
      } catch (e) {
        console.warn(
          "\x1b[31m[Warning]\x1b[0m Sentry unreachable or validation failed. Proceeding with caution.",
        );
      }
      // -------------------------

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction:
          "You are an autonomous AI swarm worker inside an isolated repository worktree. You have access to bash commands, file reading, and file writing. Execute your assigned instruction and write your output to the required location. When you are completely finished, output the exact word 'DONE'. Use tools to discover codebase context before acting. Always use standard paths under /workspace.",
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

      const chat = model.startChat({});
      console.log(`Starting agent execution for instruction: ${instruction}`);
      rootSpan.setAttribute("instruction", instruction);

      let nextPrompt: string | Array<any> =
        `Execute this instruction:\n\n${instruction}\n\nUse your tools to explore and write the requested report. Say DONE when finished.`;

      for (let i = 0; i < 30; i++) {
        try {
          console.log(`\n--- Iteration ${i + 1} ---`);
          const response = await chat.sendMessage(nextPrompt);
          const text = response.response.text();

          if (text) {
            console.log(`AGENT: ${text}`);
          }

          if (text.includes("DONE")) {
            console.log("Agent finished successfully.");
            rootSpan.setStatus({ code: 1 });
            rootSpan.end();
            await stopTracing();
            process.exit(0);
          }

          const functionCalls = response.response.functionCalls();
          if (!functionCalls || functionCalls.length === 0) {
            nextPrompt =
              "Please continue working or output exactly 'DONE' if you are completely finished.";
            continue;
          }

          const toolResponses: any[] = [];
          for (const call of functionCalls) {
            await tracer.startActiveSpan(
              `Tool:${call.name}`,
              async (toolSpan) => {
                const args = call.args as Record<string, any>;
                console.log(
                  `> CALLING TOOL: ${call.name} with ${JSON.stringify(args).slice(0, 100)}...`,
                );
                try {
                  toolSpan.setAttribute("tool.args", JSON.stringify(args));
                  if (call.name === "read_file") {
                    const content = fs.readFileSync(args.filePath, "utf8");
                    console.log(
                      `> READ ${args.filePath} (${content.length} bytes)`,
                    );
                    toolSpan.setAttribute(
                      "tool.content_length",
                      content.length,
                    );
                    toolResponses.push({
                      functionResponse: {
                        name: call.name,
                        response: { content: content.slice(0, 20000) },
                      },
                    });
                  } else if (call.name === "write_file") {
                    fs.mkdirSync(path.dirname(args.filePath), {
                      recursive: true,
                    });
                    fs.writeFileSync(args.filePath, args.content, "utf8");
                    console.log(`> WROTE ${args.filePath}`);
                    toolSpan.setAttribute(
                      "tool.content_length",
                      String(args.content).length,
                    );
                    toolResponses.push({
                      functionResponse: {
                        name: call.name,
                        response: { success: true },
                      },
                    });
                  } else if (call.name === "exec_command") {
                    try {
                      const output = execSync(args.command, {
                        encoding: "utf8",
                        stdio: ["pipe", "pipe", "pipe"],
                      });
                      console.log(`> EXEC ${args.command} STDOUT:\n${output}`);
                      toolSpan.setAttribute(
                        "tool.output",
                        output.slice(0, 500),
                      );
                      toolResponses.push({
                        functionResponse: {
                          name: call.name,
                          response: { output: output.slice(0, 20000) },
                        },
                      });
                    } catch (execErr: any) {
                      const errorOutput =
                        execErr.stderr?.toString() ||
                        execErr.stdout?.toString() ||
                        execErr.message;
                      console.log(
                        `> EXEC ${args.command} FAILED:\n${errorOutput}`,
                      );
                      toolSpan.recordException(execErr);
                      toolResponses.push({
                        functionResponse: {
                          name: call.name,
                          response: { error: errorOutput },
                        },
                      });
                    }
                  }
                  toolSpan.setStatus({ code: 1 });
                } catch (err: any) {
                  console.error(`> TOOL ERROR: ${err.message}`);
                  toolSpan.recordException(err);
                  toolSpan.setStatus({ code: 2, message: err.message });
                  toolResponses.push({
                    functionResponse: {
                      name: call.name,
                      response: { error: err.message },
                    },
                  });
                } finally {
                  toolSpan.end();
                }
              },
            );
          }

          nextPrompt = toolResponses;
        } catch (e: any) {
          console.error("Error in agent loop:", e.message);
          nextPrompt = `Error occurred: ${e.message}. Please adjust and try again.`;
        }
      }

      console.error("Max iterations reached.");
      rootSpan.setStatus({ code: 2, message: "Max iterations reached" });
      rootSpan.end();
      await stopTracing();
      process.exit(1);
    },
  ); // End rootSpan
}

run();
