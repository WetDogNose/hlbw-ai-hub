#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";
import WebSocket from "ws";
import stripAnsi from "strip-ansi";

const execAsync = promisify(exec);

// Local state for the A2A WebSocket PTY driver
let activeWsSession: WebSocket | null = null;
let ptyBuffer: string = "";

const server = new Server(
  {
    name: "docker-gemini-cli-mcp",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ---------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------

const RUN_HEADLESS_TOOL: Tool = {
  name: "run_gemini_headless",
  description:
    "Runs a gemini-cli command purely headless inside the isolated container. Automatically enforces YOLO and zero-safety-guard arguments to guarantee uninterrupted execution. Use this for general interactions and one-off commands.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description:
          "The gemini-cli command to run (e.g., 'gemini-cli chat \"Hello\"' or 'gemini-cli run \"ls\"'). Do not include safety flags, they are injected automatically.",
      },
      stdinData: {
        type: "string",
        description:
          "Optional standard input to pipe into the command (e.g., a massive text block or prompt).",
      },
    },
    required: ["command"],
  },
};

const START_INTERACTIVE_TOOL: Tool = {
  name: "start_interactive_session",
  description:
    "Initiates a persistent, stateful interactive PTY session against the internal container using WebSockets. Use this ONLY if you intend to dynamically answer prompts iteratively.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

const READ_SCREEN_TOOL: Tool = {
  name: "read_interactive_screen",
  description:
    "Reads the current terminal screen buffer of the active interactive PTY session. Automatically strips ANSI formatting into clean readable logs.",
  inputSchema: {
    type: "object",
    properties: {
      clearBuffer: {
        type: "boolean",
        description:
          "If true, clears the buffer after reading so subsequent reads only show new output.",
      },
    },
  },
};

const SEND_INPUT_TOOL: Tool = {
  name: "send_interactive_input",
  description:
    "Sends keystrokes or text directly to the interactive PTY session. Make sure to include a trailing newline (\\n) if you want to simulate hitting Enter.",
  inputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description:
          "The exact keystrokes/text to send. Use '\\n' for Enter, '\\x03' for Ctrl+C, etc.",
      },
    },
    required: ["text"],
  },
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      RUN_HEADLESS_TOOL,
      START_INTERACTIVE_TOOL,
      READ_SCREEN_TOOL,
      SEND_INPUT_TOOL,
    ],
  };
});

// ---------------------------------------------------------
// Tool Execution
// ---------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;

  if (name === "run_gemini_headless") {
    const { command, stdinData } = request.params.arguments as {
      command: string;
      stdinData?: string;
    };

    // Cleanly inject --auto-approve yolo to ensure pure stateless execution
    // Ex: `gemini-cli chat "Hello"` becomes `gemini-cli chat "Hello" --auto-approve yolo`
    // Ensure we don't duplicate it if someone manually attached it
    const yoloCommand = command.includes("--auto-approve")
      ? command
      : `${command} --auto-approve yolo`;

    // Base headless exec payload
    const fullExec = `docker exec -i -u gemini_user gemini-cli-container sh -c "npx @google/gemini-cli ${yoloCommand}"`;

    if (stdinData) {
      // Robust piping via child_process stdin
      return new Promise((resolve) => {
        const child = exec(fullExec, (error, stdout, stderr) => {
          if (error) {
            resolve({
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Execution failed: ${error.message}\nStdout:\n${stdout}\nStderr:\n${stderr}`,
                },
              ],
            });
          } else {
            resolve({
              content: [
                {
                  type: "text",
                  text: `Stdout:\n${stdout}\n\nStderr:\n${stderr}`,
                },
              ],
            });
          }
        });
        child.stdin?.write(stdinData);
        child.stdin?.end();
      });
    }

    try {
      const { stdout, stderr } = await execAsync(fullExec);
      return {
        content: [
          { type: "text", text: `Stdout:\n${stdout}\n\nStderr:\n${stderr}` },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Execution failed: ${error.message}\n${error.stdout || ""}\n${error.stderr || ""}`,
          },
        ],
      };
    }
  }

  if (name === "start_interactive_session") {
    if (activeWsSession && activeWsSession.readyState === WebSocket.OPEN) {
      return {
        content: [
          { type: "text", text: "Interactive session is already running." },
        ],
      };
    }

    return new Promise((resolve) => {
      activeWsSession = new WebSocket("ws://127.0.0.1:8765/ws");
      ptyBuffer = "";

      let isOpened = false;

      activeWsSession.on("open", () => {
        isOpened = true;
        resolve({
          content: [
            {
              type: "text",
              text: "Successfully connected to interactive PTY WebSocket stream.",
            },
          ],
        });
      });

      activeWsSession.on("message", (data) => {
        ptyBuffer += data.toString();
      });

      activeWsSession.on("error", (err) => {
        ptyBuffer += `\n[WebSocket Error]: ${err.message}`;
        if (!isOpened) {
          resolve({
            isError: true,
            content: [
              {
                type: "text",
                text: `Failed to connect to PTY WebSocket: ${err.message}`,
              },
            ],
          });
          activeWsSession = null;
        }
      });

      activeWsSession.on("close", () => {
        if (!isOpened && activeWsSession) {
          resolve({
            isError: true,
            content: [
              { type: "text", text: "WebSocket closed before it could open." },
            ],
          });
        }
        activeWsSession = null;
        ptyBuffer += `\n[WebSocket Closed]`;
      });
    });
  }

  if (name === "read_interactive_screen") {
    if (!activeWsSession) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "No interactive session running. Call start_interactive_session first.",
          },
        ],
      };
    }
    const { clearBuffer } = request.params.arguments as {
      clearBuffer?: boolean;
    };

    // Strip chaotic terminal paint commands into clean LLM-friendly text
    const cleanOutput = stripAnsi(ptyBuffer) || "<buffer is currently empty>";

    if (clearBuffer) {
      ptyBuffer = "";
    }

    return { content: [{ type: "text", text: cleanOutput }] };
  }

  if (name === "send_interactive_input") {
    if (!activeWsSession || activeWsSession.readyState !== WebSocket.OPEN) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "No interactive session running or connection closed.",
          },
        ],
      };
    }
    const { text } = request.params.arguments as { text: string };

    activeWsSession.send(text);
    return {
      content: [
        { type: "text", text: "Input sent successfully to PTY stream." },
      ],
    };
  }

  throw new Error(`Tool not found: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "Docker Gemini CLI MCP Server initialized with Headless YOLO and A2A PTY Driver modes.",
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
