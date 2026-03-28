---
description: How to scaffold a new MCP Server within the hub using standardized wrappers and templates.
---
// turbo-all
# Scaffold MCP Server Workflow

When you are asked to create a new MCP (Model Context Protocol) Server to expose internal tooling, follow these mandatory steps.

## Step 1: Application Scaffold
Decide if the MCP Server requires Node.js or Python.
Copy the contents of the standardized template:
- Deploying remotely on standard cluster: `templates/docker/`
- Deploying remotely on Cloud Run: `templates/cloud-run/`
- Local usage only: Initialise an empty directory.

## Step 2: Inject the MCP Wrapper
You MUST use the standard wrapper instead of building the MCP connection logic from scratch.
Copy the `wrappers/mcp/` directory into your new server project.
This guarantees you are using the approved `@modelcontextprotocol/sdk` or Python equivalent.

## Step 3: Registration
If the MCP server is intended to be used locally within the hub immediately, you MUST register it inside the appropriate Swarm Sub-Agent configuration inside `tools/docker-gemini-cli/configs/<category>/mcp_config.json` depending on its domain (e.g., `3_cloud`, `4_db`). DO NOT register it in the root IDE `mcp_config.json` unless it is a core orchestration tool for the Master Agent.

## Maintenance Notes
Always ensure that the `@modelcontextprotocol/sdk` package version defined in your new server matches the version stored in the root `wrappers/mcp/package.json` template. Do not diverge dependencies lightly. If you must update the MCP SDK version for your specific server, proactively update the template to keep the ecosystem in sync.
