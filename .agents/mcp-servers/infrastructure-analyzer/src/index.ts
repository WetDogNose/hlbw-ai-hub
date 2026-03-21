import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs/promises";
import * as path from "path";

const server = new Server(
  {
    name: "infrastructure-analyzer",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// We assume this MCP is run from inside the wot-box repository somewhere.
const REPO_ROOT = path.resolve(__dirname, "../../../../");

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_prisma_schema",
        description: "Quickly reads the raw Prisma schema (prisma/schema.prisma) without needing to search the filesystem. Gives immediate context on database models.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_cloud_env_config",
        description: "Quickly reads the cloudbuild.yaml and next.config.ts to understand deployment regions, service names, and environment mappings.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  if (name === "get_prisma_schema") {
    try {
        const schemaPath = path.join(REPO_ROOT, "prisma/schema.prisma");
        const content = await fs.readFile(schemaPath, "utf8");
        return {
            content: [{ type: "text", text: content }],
        };
    } catch (e: any) {
        return {
            isError: true,
            content: [{ type: "text", text: `Failed to read schema: ${e.message}` }]
        };
    }
  }

  if (name === "get_cloud_env_config") {
     try {
        const cloudBuildPath = path.join(REPO_ROOT, "cloudbuild.yaml");
        
        // Auto-detect the next.config file extension (.ts, .mjs, .js)
        const nextConfigCandidates = ["next.config.ts", "next.config.mjs", "next.config.js"];
        let nextConfigPath: string | null = null;
        let nextConfigName = "next.config.*";
        for (const candidate of nextConfigCandidates) {
            const candidatePath = path.join(REPO_ROOT, candidate);
            try {
                await fs.access(candidatePath);
                nextConfigPath = candidatePath;
                nextConfigName = candidate;
                break;
            } catch {}
        }
        
        let out = "";
        try {
            out += "=== cloudbuild.yaml ===\n" + await fs.readFile(cloudBuildPath, "utf8") + "\n\n";
        } catch (e: any) { out += "Missing cloudbuild.yaml\n\n"; }
        
        if (nextConfigPath) {
            try {
                out += `=== ${nextConfigName} ===\n` + await fs.readFile(nextConfigPath, "utf8");
            } catch (e: any) { out += `Missing ${nextConfigName}\n`; }
        } else {
            out += "Missing next.config.* (no .ts, .mjs, or .js variant found)\n";
        }

        return {
            content: [{ type: "text", text: out }],
        };
    } catch (e: any) {
        return {
            isError: true,
            content: [{ type: "text", text: `Failed to read configs: ${e.message}` }]
        };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Infrastructure Analyzer MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
