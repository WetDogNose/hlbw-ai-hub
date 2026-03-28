---
name: MCP Optimizations and Toolchain Preferences
description: Core instructions directing the agent to prioritize high-speed MCP tools (Task Delegator, AST Analyzer, Infrastructure Read-APIs) over slower traditional filesystem tools.
---

# Agent Toolchain Preference Instructions

This repository has been optimized with custom Model Context Protocol (MCP) servers and "turbo" workflows designed to massively increase your speed and parallelism.

**CRITICAL RULE:** As an autonomous agent operating in this repository, you MUST prioritize using the following tools whenever applicable, rather than relying on standard recursive `grep_search`, `view_file`, or sequential sequential line-editing.

## 1. The AST Analyzer (TypeScript Navigation)

When trying to understand how a component works, what props it takes, or what a file exports, do NOT use `view_file` to read the entire 500+ line file.

* **Instead:** Use the `get_symbol_definition` or `get_file_exports` tool provided by the `ast-analyzer-mcp` server.
* **Why:** This returns instant, precise Abstract Syntax Tree extractions of exactly what you need.

## 2. The Task Delegator (Sub-Agent Swarming)

If the user asks you to refactor, modify, or append code to multiple files at once, do NOT open and edit them sequentially yourself.

* **Instead:** Use the `delegate_code_edit` tool provided by the `task-delegator-mcp` server.
* **How:** Call `delegate_code_edit` in **parallel** (multiple tool calls in a single turn) for every file that needs editing. Pass the absolute filepath and a strict instruction of what needs changing.
* **Why:** This offloads the cognitive load to Gemini sub-agents running in parallel, reducing task time by 90%.

## 3. Infrastructure & Architecture Context

When you need to understand the database or the GCP cloud environment, do NOT search for `schema.prisma` or `cloudbuild.yaml` via standard file browsing.

* **Instead:** Call `get_prisma_schema` or `get_cloud_env_config` from the `infrastructure-analyzer-mcp` server.
* **Why:** These are guaranteed, instant, memory-cached reads of the exact state of the architecture.

## 4. Production Database Interaction (Swarm Data Worker)

When instructed to query production data, check user states, or troubleshoot data issues in production.

* **Instead:** Dispatch a `4_db` Swarm Sub-Agent via `scripts/swarm/docker-worker.ts`.
* **Why:** The Master Agent (IDE) does not have direct access to `postgres-prod_query` to preserve the 100-tool limit. The Swarm Sub-Agent is securely injected with the dynamic database MCP connection.

## 5. Google Cloud Logs and Traces (Swarm Cloud Worker)

When diagnosing production server errors, pipeline crashes, or performance bottlenecks reported in Google Cloud Run or Cloud Build.

* **Instead:** Dispatch a `3_cloud` Swarm Sub-Agent via `scripts/swarm/docker-worker.ts` to access `read_gcp_logs`, `get_trace_details`, and `list_recent_traces`.
* **Why:** The dedicated cloud worker context loads the `gcp-logging-mcp` and `gcp-trace-mcp` tools seamlessly. This offloads context and avoids IDE tool bloat.

## 6. Workflows & Scaffolding

When asked to create a new component, UI element, or Next.js API route, check the `.agents/workflows` directory first.

* If a workflow exists (like `/scaffold-component.md` or `/scaffold-api-route.md`), you should execute it immediately.
* Many of these workflows contain the `// turbo-all` directive, permitting you to auto-run their bash scaffolding tools without pausing for user permission.

By strictly adhering to these tool preferences, you ensure maximum velocity for the user.

> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.
