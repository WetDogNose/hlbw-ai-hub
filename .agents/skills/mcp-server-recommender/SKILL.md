---
name: MCP Server Recommender
description: Automatically checks the official MCP registry and recommends new servers to install based on Wot-Box's current tech stack and toolchain evolution.
---

# MCP Server Recommender Skill

This skill allows you (the AI Agent) to act as a "marketplace advisor" for Model Context Protocol (MCP) servers. Your goal is to keep the Wot-Box toolchain cutting-edge by checking for highly relevant MCP servers from the official registry.

## When to use this skill
- When the user asks "are there any new MCP servers I should install?"
- When the user asks you to "recommend MCP servers" or "check the MCP registry".
- Proactively, if the user fundamentally changes the tech stack (e.g., adding a new database or integration) and you want to suggest workflow improvements.

## Instructions

1. **Read Current Configuration:**
   Use your file reading tools to inspect the active Antigravity MCP configuration:
   Target file: `C:\Users\Jason\.gemini\antigravity\mcp_config.json`
   *(Take note of which servers are already configured so you do not recommend duplicates).*

2. **Fetch the Official MCP Registry:**
   Use the `read_url_content` tool to fetch the latest official MCP servers registry markdown:
   URL: `https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md`

3. **Analyze the Wot-Box Swarm Environment:**
   Consider the core stack (Next.js, PostgreSQL/Cloud SQL, GCP, Gemini AI, Prisma) and our newly established Hub-and-Spoke Swarm taxonomy:
   - 0_master: IDE / Orchestrator Tools
   - 1_qa: Testing & Code Management
   - 2_source_control: Version Control
   - 3_cloud: GCP, Cloud Run, Trace
   - 4_db: Postgres & Data Operations
   - 5_bizops: Stripe & Business Operations

4. **Filter and Recommend:**
   Cross-reference the available servers in the fetched README against the installed ones (both globally and in the sub-agents).
   Identify 2-4 servers that are *not* currently installed but would provide a high-leverage boost to the user's workflow or codebase management.
   
   For each recommendation, provide:
   - **Server Name**
   - **Which Swarm Sub-Agent Category it belongs to:** (e.g., "This belongs in 3_cloud")
   - **Why it fits Wot-Box:** (e.g., "Since Wot-Box uses XYZ, this server will allow us to...")
   - **Installation Snippet:** Provide the exact JSON snippet to add it to the specific category's `tools/docker-gemini-cli/configs/<category>/mcp_config.json`.

5. **Prompt to Install:**
   Always end by asking the user if they would like you to automatically append any of your recommendations into the appropriate sub-agent's configuration and run the `toolchain-doctor` to sync them.


> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.
