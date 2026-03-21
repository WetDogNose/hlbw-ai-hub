# HLBW AI Hub: Master Orchestration Control Plane

## 🤖 CRITICAL INSTRUCTION FOR ALL AI AGENTS
**MANDATORY DIRECTIVE:** This project `hlbw-ai-hub` is the **Master Agent Control Plane**. Its primary responsibility is orchestration, environment configuration, agent swarming, and Model Context Protocol (MCP) integrations. It does NOT contain the core business logic of Wot-Box.
**DIRECTORY HYGIENE:** Never write logs, temporary files, or general artifacts to the root directory. Always write logs to `logs/`, temporary logic/data files to `tmp/`, and documentation to `docs/` or `.agents/`.
**SWARM DELEGATION:** When faced with a large, multi-component, or highly parallelizable task across the ecosystem, you MUST evaluate if you can hand off work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel Docker sub-agents using the `scripts/swarm/` toolchain.
**MCP MANAGEMENT:** This repository houses the unified `mcp.json` and manages MCP servers for the entire infrastructure (including `wot-box`).
**MCP EFFICIENCY & SPEED (CRITICAL):** You MUST prioritize the use of custom MCP servers over slow CLI execution or manual filesystem searches. Speed of action is YOUR HIGHEST PRIORITY. Use `gcp-logging-mcp` and `gcp-trace-mcp` for diagnosing production/cloud issues instead of gcloud/bash commands. Use `ast-analyzer-mcp` to inspect code instead of linearly reading files. Use `infrastructure-analyzer-mcp` instead of searching the codebase for schema/config info. Reference `.agents/skills/mcp-optimizations/SKILL.md` for the full breakdown.

---

## 🏗 System Overview
`hlbw-ai-hub` acts as the neural center for the HLBW organization. It contains:
- The `hlbw-ai-hub.code-workspace` definition.
- The shared `.agents` skills and workflows directory.
- The `scripts/` directory for swarms and database management.
- The central `.env` for secrets meant to be synced to Google Secret Manager.
- The GCP Cloud Build pipeline configurations.

## 🧑‍💻 AI Toolchain Overview
This project contains the robust command-and-control toolchain.

- **`App Tester` Skill**: Validates external applications (like `wot-box`) via the orchestration network.
- **`Toolchain Doctor` Skill**: Keeps MCP definitions, API keys, and workspace settings synchronized across the monorepo-like environment.
- **`Master Agent Coordinator` Workflow**: The primary workflow for dispatching local Docker execution agents.

*For all domain-specific application code (React, Next.js, Prisma, CSS), refer to the associated application repositories (e.g., `wot-box`).*
