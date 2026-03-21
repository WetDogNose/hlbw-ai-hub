import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

<agent_directive priority="CRITICAL" domain="Logic">
  OpenTelemetry initialization MUST NOT be removed.
</agent_directive>
import { initTelemetry } from "./otelSetup.js";

const logger = initTelemetry('mcp-agent-wrapper');

const server = new Server({
  name: "mcp-wrapper-template",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

// Expose tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "example_tool",
        description: "An example tool exposed by this wrapper",
        inputSchema: {
          type: "object",
          properties: {
            input: { type: "string" }
          },
          required: ["input"]
        }
      }
    ]
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  <agent_instruction execution_type="sequential" target_action="Tool Request Handling">
    <step order="1">Integrate tool requests with internal agent logic.</step>
  </agent_instruction>
  <agent_directive priority="HIGH" domain="Logic">
    Domain-heavy execution logic MUST NOT be placed directly within this handler.
  </agent_directive>
  if (request.params.name === "example_tool") {
    const input = request.params.arguments.input;
    // TODO: Route to internal agent logic
    return {
      content: [{ type: "text", text: `Processed: ${input}` }]
    };
  }
  throw new Error(`Tool not found: ${request.params.name}`);
});

// Wrap agent and connect to standard input/output
async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP Wrapper server is running via stdio");
}

start().catch((err) => {
  logger.error("Fatal error starting MCP Wrapper:", err);
  process.exit(1);
});
