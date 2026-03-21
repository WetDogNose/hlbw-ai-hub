import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs/promises";
import * as path from "path";
import dotenv from "dotenv";

// Suppress console.log so it doesn't break the MCP stdio protocol
const originalConsoleLog = console.log;
console.log = () => {};

// Find the appropriate .env file (supports isolated Worktrees)
const workspaceRoot = process.env.WOT_BOX_WORKSPACE || path.resolve(__dirname, "../../../../");
const envPath = path.resolve(workspaceRoot, ".env");
dotenv.config({ path: envPath });

// Restore console.log
console.log = originalConsoleLog;

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!API_KEY) {
  console.error("GEMINI_API_KEY environment variable is required.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
// We use Gemini Flash for speed in task delegation, it's fast and capable enough for isolated edits.
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  systemInstruction:
    "You are an expert autonomous software engineer acting as a sub-agent swarm worker. " +
    "You will be given the contents of a specific file and an instruction on how to edit it. " +
    "Your ONLY job is to output the final, complete, fully modified file content. " +
    "CRITICAL RULES: \n" +
    "1. Do NOT wrap your output in markdown code blocks like ```typescript or ```. Output ONLY the raw code string as it should be written directly to the file payload.\n" +
    "2. Do NOT explain your changes. Output NOTHING but the final file content.\n" +
    "3. Ensure the modified code is syntactically valid and properly formatted.",
});

const server = new Server(
  {
    name: "task-delegator",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "delegate_code_edit",
        description:
          "Dispatches a swarm sub-agent to concurrently read, reason over, and rewrite a file according to strict instructions. Use this to massively parallelize refactoring or cross-cutting changes.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Absolute path to the file to edit.",
            },
            instruction: {
              type: "string",
              description: "The specific refactoring or coding instruction for the sub-agent to apply to this file.",
            },
          },
          required: ["filePath", "instruction"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "delegate_code_edit") {
    const filePath = String(request.params.arguments?.filePath);
    const instruction = String(request.params.arguments?.instruction);

    if (!filePath || !instruction) {
      throw new Error("filePath and instruction are required");
    }

    try {
      // 1. Read the target file
      const currentContent = await fs.readFile(filePath, "utf8");

      // 2. Construct the prompt
      const prompt = `FILE PATH: ${filePath}\n\nINSTRUCTION:\n${instruction}\n\nCURRENT FILE CONTENT:\n${currentContent}\n\nCRITICAL REMINDER: Output EXACTLY the final intended file text with NO MARKDOWN WRAPPERS and NO EXPLANATIONS.`;

      // 3. Delegate to Gemini
      const result = await model.generateContent(prompt);
      let newContent = result.response.text();

      // Ensure no markdown wrappers slipped through (fail-safe)
      newContent = newContent.replace(/^```[\w-]*\n/, "").replace(/\n```$/, "");

      // 4. Write back to disk
      await fs.writeFile(filePath, newContent, "utf8");

      return {
        content: [
          {
            type: "text",
            text: `Successfully delegated task. Agent read ${filePath}, applied instructions, and wrote modifications back to disk.`,
          },
        ],
      };
    } catch (error) {
       console.error(`Delegation failed for ${filePath}:`, error);
       const errorMessage = error instanceof Error ? error.message : String(error);
       return {
         content: [
           {
             type: "text",
             text: `Failed to process delegation for ${filePath}: ${errorMessage}`,
           },
         ],
         isError: true,
       };
    }
  }

  throw new Error("Unknown tool");
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Task Delegator MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
