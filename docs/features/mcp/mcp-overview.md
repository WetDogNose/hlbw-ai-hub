# Agent Context Protocol (MCP) Services

## What is an MCP Service?

The Model Context Protocol (MCP) is a system that allows AI assistants to securely connect directly to local tools, development environments, and data sources.

Instead of an AI generating a script for the user to run manually (e.g., "copy this Node.js script to query your database"), an MCP server exposes those capabilities natively to the AI as **tools**.

For example, a PostgreSQL MCP server allows the AI to securely run SQL `SELECT` queries directly against a database, analyze the results in-memory, and immediately provide the insights to the user.

## How this Project's MCP Services are Spun Up

To ensure MCP tools are portable across the entire team, this project stores its configuration internally rather than requiring developers to set up global configurations for every tool.

1. **Portable Wrapper Script**: The native client configuration tools do not support reading from `.env` files directly. To keep production database passwords out of GitHub, our setup relies on an internal Node.js wrapper script (`scripts/mcp-wrapper.js`).
2. **Global Integration**: The developer points their global IDE configuration (`C:\\Users\\<user>\\.gemini\\mcp.json`) to invoke this project's local wrapper script.
3. **Execution**: The wrapper script securely loads `MCP_DATABASE_URL` from your local ignored `.env` file and spawns the actual MCP server process dynamically from local node_modules.
4. **Communication**: The AI client communicates with the spawned MCP server over standard input/output (stdio) using the MCP JSON-RPC protocol.
5. **Usage**: When asked a databased-related question, the AI calls the exposed tool, the client passes it to the MCP server, and the query is executed safely.

## Security

MCP servers run locally on the user's machine, using the user's network context and credentials. The AI only has access to the specific tools the MCP server explicitly exposes, and the user must configure the server with the appropriate authentication.

---

## Available MCP Servers in this Project

1. **PostgreSQL**: Queries the Cloud SQL production database safely.
2. **GCP Trace**: Queries OpenTelemetry (OTEL) traces directly from Google Cloud Trace via API (`gcp-trace` server).
3. **App Tester**: Executes unit tests via MCP.

*For specific setup instructions regarding this project's database, see [PostgreSQL MCP Server Setup](postgres-mcp-server.md).*

## 🤖 MANDATORY AGENT DIRECTIVE

**CRITICAL:** AI Agents MUST prioritize using these specialized MCP servers over executing manual CLI commands or sequential filesystem searches.

- Use the PostgreSQL MCP to query the database instantly instead of spawning a bash proxy shell.
- Use the App Tester MCP to run tests natively and catch stack traces instead of using `npm run test` in a terminal.
- Use the `ast-analyzer-mcp` or `infrastructure-analyzer-mcp` to resolve code context instead of manually reading files line-by-line.
