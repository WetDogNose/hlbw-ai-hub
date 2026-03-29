# Model Context Protocol (MCP) Wrapper

The `wrappers/mcp/` directory provides a lightweight bridge to expose your agent's internal tooling as a fully compliant MCP Server over `stdio`.

## When to Use

Use this wrapper when:

1. You want to expose a backend agent or specific custom tool chain so that an IDE (e.g., Cursor, Claude Desktop) or another MCP-compliant LLM can interact with it.
2. You have built specialized business logic and want to abstract it as an MCP "tool" for the `hlbw-ai-hub`.

## Components

- **`index.js`**: An implementation of the `@modelcontextprotocol/sdk` capable of serving Tool definitions and responding to execution requests.

## How to Use

**CRITICAL:** This standard code wrapper is the *required* method for exposing MCP capabilities within the hub.

1. Use this `mcp` wrapper code as the entry point for your MCP server.
2. Run `npm install` to acquire the MCP SDK.
3. Open `index.js`.
4. Modify the `ListToolsRequestSchema` handler to describe the tools your agent/logic supports.
5. Modify the `CallToolRequestSchema` handler to route the request parameter to the correct local function.
6. To use this locally in the hub, add the full path to this script directly to your `mcp.json` file like any other MCP server:

```json
"mcp-wrapper-example": {
  "command": "node",
  "args": ["c:/Users/Jason/repos/hlbw-ai-hub/wrappers/mcp/index.js"]
}
```

## Deployment Environment

When deploying this MCP server remotely, **do not write a custom deployment configuration**. Instead, you must place this wrapper code and your logic into the appropriate deployment template for your target environment:

- Use the **Docker Base Templates** (`templates/docker/`) for standalone cluster deployments.
- Use the **Cloud Run Templates** (`templates/cloud-run/`) for serverless deployments.

## Considerations

- The current template uses the `StdioServerTransport` as it is the most robust and commonly used default for local MCP implementations. If you deploy this across the network, you can switch the transport layer to Server-Sent Events (SSE).
