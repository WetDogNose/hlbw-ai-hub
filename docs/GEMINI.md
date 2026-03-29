# HLBW AI Hub: Master Orchestration Control Plane

## 🤖 CRITICAL INSTRUCTION FOR ALL AI AGENTS

**MANDATORY DIRECTIVE:** This project `hlbw-ai-hub` is the **Master Agent Control Plane**. Its primary responsibility is orchestration, environment configuration, agent swarming, and Model Context Protocol (MCP) integrations. It does NOT contain the core business logic of Wot-Box.
**DIRECTORY HYGIENE:** Never write logs, temporary files, or general artifacts to the root directory. Always write logs to `logs/`, temporary logic/data files to `tmp/`, and documentation to `docs/` or `.agents/`.
**SWARM DELEGATION:** When faced with a large, multi-component, or highly parallelizable task across the ecosystem, you MUST evaluate if you can hand off work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel Docker sub-agents using the `scripts/swarm/` toolchain.
**MCP MANAGEMENT:** This repository houses the unified `mcp.json` and manages MCP servers for the entire infrastructure (including `wot-box`).
**MCP EFFICIENCY & SPEED (CRITICAL):** When running locally, you MUST prioritize the use of custom MCP servers over slow CLI execution or manual filesystem searches. Speed of action is YOUR HIGHEST PRIORITY. Use `gcp-logging-mcp` and `gcp-trace-mcp` for diagnosing production/cloud issues instead of gcloud/bash commands. Use `ast-analyzer-mcp` to inspect code instead of linearly reading files. Use `infrastructure-analyzer-mcp` instead of searching the codebase for schema/config info. Reference `.agents/skills/mcp-optimizations/SKILL.md` for the full breakdown. *(Note: If you are running in a GitHub Actions workflow, you DO NOT have access to these local MCP servers and this directive does not apply. You must use standard bash/CLI tools instead).*
**AGENT DIRECTIVES & STRUCTURAL INTEGRITY:** Whenever establishing new rules, instructions, or hints for other AI agents to follow across the `hlbw-ai-hub` workspace, you MUST format them entirely utilizing rigorous Markdown Callouts (e.g., `> [!IMPORTANT]`, `> [!NOTE]`, `> [!TIP]`). Furthermore, to prevent logical loops, contradictions, or ambiguity, you MUST actively consult the Directive Enforcer Sentry microservice by invoking the **`directive-enforcer-sentry`** skill to pre-validate your new instructions before committing them to the workspace.
**AGENT DEPLOYMENT & WRAPPERS:** When creating a new AI Agent or MCP Server, you MUST NOT write custom Dockerfiles or from-scratch entry points. You MUST use the standard wrappers in `wrappers/a2a/` or `wrappers/mcp/` as your entry points. For deployment, you MUST place these wrappers into either the `templates/docker/` or `templates/cloud-run/` environment templates. Review `.agents/workflows/scaffold-agent.md` and `.agents/workflows/scaffold-mcp.md` for instructions.
**TEMPLATES & WRAPPERS MAINTENANCE:** If you are ever tasked with updating core agent libraries (like `@modelcontextprotocol/sdk`, `fastapi`, or `genkit`), or if you change deployment environment standards, you MUST proactively update the corresponding baselines in `templates/` and `wrappers/` to ensure parity across the hub ecosystem
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
