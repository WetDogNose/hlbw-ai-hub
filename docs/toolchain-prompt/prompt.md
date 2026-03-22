# Master AI Toolchain Blueprint

**System Prompt Directive for AI Agents:**
You are working in the `hlbw-ai-hub` repository. This is the **Master Agent Control Plane**. 
This document is a technical blueprint detailing the exact agent instructions, scripts, and Model Context Protocol (MCP) servers necessary to achieve a high-velocity, self-healing, autonomous development environment across the entire organization.

**CORE HUB BEHAVIORS (CRITICAL):**
1. **MCP First:** Never use slow CLI commands if an MCP server (`ast-analyzer`, `app-tester`, `gcp-logging`) can fetch structured data instantly.
2. **Swarm First:** Never attempt slow, sequential multi-file refactoring. Always dispatch parallel sub-agents using the Master Agent Coordinator workflow (`scripts/swarm`) when tackling wide changes.
3. **Control Plane Hygiene:** Do not write domain business logic (e.g., React components, Prisma schemas) to this repository. This repository only writes infrastructure, workflow orchestration, and MCP server management code.

Make sure to implement and maintain all 6 pillars in this workspace.

## Pillar 1. The "Toolchain Doctor" (Self-Healing & Diagnostics)

The Toolchain Doctor is a script and an associated AI Skill that runs continuously to ensure the repository remains healthy.

**1. Create the Diagnostic Script (e.g., `scripts/toolchain-doctor.js` or `.py`):**
Implement a script that does the following on execution:
- Executes a cleanup script to clear out stale logs and temporary files.
- Validates the existence of your environment variables file (e.g., `.env`) by comparing against its template (`.env.example`).
- Scans `.agents/skills/` recursively. If a folder exists but is missing a `SKILL.md` file, it throws an error.
- Scans `scripts/` (or your equivalent tool directory) for files and validates their syntax.
- **MCP Auto-Discovery & Syncing:** Automatically synchronizes and discovers local MCP server config files to ensure the CLI and IDE agents have access to the same tools.

**2. Create the AI Skill (`.agents/skills/toolchain-doctor/SKILL.md`):**
Write instructions for the AI Agent:
* "When the user asks you to 'fix the toolchain' or if a git hook fails, run the doctor script."
* "If the doctor reports a missing `SKILL.md` for a folder, you MUST synthesize a new `SKILL.md` explaining how the AI should use the scripts inside that folder."
* "If there are syntax errors in the tools, use your coding abilities to fix them."
* "If there are missing environment keys, instruct the user on what to add. DO NOT commit secrets."
* "If you see orphaned script files in the root that look like tools, move them to the script directory."

## Pillar 2. Model Context Protocol (MCP) Optimizations

To stop the AI from slowly grepping files or reading massive source codes sequentially, you must build AI preference directives.

**1. Create the AI Skill (`.agents/skills/mcp-optimizations/SKILL.md`):**
Write strict instructions for the AI Agent:
* "**CRITICAL RULE:** Prioritize specialized MCP tools over sequential filesystem tools (`grep_search`, `view_file`)."
* "**AST Analyzer:** Use abstract syntax tree resolution tools instead of reading whole files to understand components and dependencies."
* "**Task Delegator:** Use sub-agent delegation tools to run parallel agents for wide refactoring."
* "**Infrastructure Analyzer:** Use context-fetching tools for instant architectural and database schema context instead of manually searching configuration files."
* "**Cloud Logging & Tracing:** Use direct MCP log fetchers instead of slow OS-level CLI commands."
* "**Database Actions:** Use direct MCP SQL/query tools instead of manual CLI proxy commands."

## Pillar 3. Autonomous Testing & Validation

The AI must be able to run distinct testing tiers natively via MCP without resorting to bash terminals.

**1. Create the MCP Server Wrapper:**
Build a local Model Context Protocol server that wraps your repository's testing commands (e.g., Unit, Integration, E2E, Types/Linting) and exposes them as tools to the AI.

**2. Create the AI Skill (`.agents/skills/app-tester/SKILL.md`):**
Instruct the AI on the autonomous testing loop:
* "If you modify code, you MUST analyze the diff scope and run the corresponding pipeline natively via the MCP testing tools."
* "Map specific changes to logical testing bounds (e.g., UI changes trigger unit tests, database changes trigger integration tests)."
* "If the MCP testing tool returns an error, catch the stack trace, fix the implementation locally, and recursively re-run the tool until it passes."

## Pillar 4. Systems-Level Memory Tracking

AI testing loops can cause Out-Of-Memory (OOM) errors. Provide a way for the AI to track memory growth.

**1. Create the memory wrapper logic:**
Modify your test run scripts to pipe execution through a memory tracker that outputs snapshot logs to a dedicated `logs/` directory.

**2. Create the AI Skill (`.agents/skills/memory-analyzer/SKILL.md`):**
Instruct the AI:
* "When tests fail due to memory, scan the logs directory for the latest tracker logs."
* "Compare the 'Top Aggregated Applications' sections between snapshots."
* "If specific tools or databases continuously grow without releasing memory across multiple tests, identify the leak."
* "Apply common fixes: Ensure database disconnects in test teardowns, check MCP server LRU caches, or force manual garbage collection."

## Pillar 5. Environment & Infrastructure Tooling

Automate the mundane setup and configuration tasks via explicit skills:

* **Bootstrap Environment (`.agents/skills/bootstrap-environment/SKILL.md`):** Instructs the AI to autonomously install dependencies and handle external service authentication upon initial clone.
* **Coverage Reporter (`.agents/skills/coverage-reporter/SKILL.md`):** Instructs the AI to run comprehensive test coverage commands and write reports into the logs directory for the user.
* **Production Database Triage (`.agents/skills/production-db-triage/SKILL.md`):** Links to a read-only MCP tool allowing the agent to safely read live user states without writing destructive commands.
* **Repo Cleaner (`.agents/skills/repo-cleaner/SKILL.md`):** A skill pointing to a cleanup script to purge old logs, test coverage outputs, and temporary files.

## Pillar 6. Turbo-Enabled Workflows (`.agents/workflows/`)

Establish a directory of standardized `.md` files that the AI can execute without user prompting.

**1. Create Workflow Markdown Files:**
For every repetitive task, create a markdown file (e.g., `.agents/workflows/scaffold-component.md`).
- Include standard company boilerplates.
- Include exact terminal commands to run.
- Inject the string `// turbo-all` at the top of the file so the AI is authorized to execute the bash commands automatically without waiting for user permission.

**Examples to include:**
- Scaffolding new components or modules.
- Scaffolding new API endpoints.
- Running database migrations.
- Automated deployment and version tagging.

## Pillar 7. CI/CD Pipeline & Workflow Templates

Standardize how pipelines and runner environments are built to prevent ad-hoc and brittle configurations.

**1. Update Agent Directives:**
* "If the user asks to create or deploy a CI/CD pipeline, you MUST look in `docs/templates/pipelines.md` for guidance."
* "Never invent a GitHub Actions workflow from scratch. Always copy the base templates located inside `templates/pipelines/github-actions/`."
* "If queried about GitHub Actions runners or self-hosted infrastructure, refer the user immediately to `docs/templates/pipelines/gha-runners.md` which explains standard vs. self-hosted runners."

## Pillar 8. Agent Directive Enforcement (Sentry Validation)

To eliminate "context rot" and perfectly align multi-agent workflows, all rules, hints, and instructions for other agents MUST be rigorously verified and converted to explicit Markdown Callouts.

**1. Create the AI Skill (`.agents/skills/directive-enforcer-sentry/SKILL.md`):**
Instruct the AI on the architectural validation loop:
* "If you are writing a new Agent Directive (`> [!IMPORTANT]`), Agent Instruction (`> [!NOTE]`), or Agent Hint (`> [!TIP]`), you MUST NOT write it directly to the file based on intuition."
* "You MUST execute the `directive-enforcer-sentry` payload snippet to query the continuous A2A Sentry microservice (`http://localhost:8080/a2a/message`)."
* "The Sentry will rewrite your instruction to prevent logical loops and context collisions across your entire massive workspace. You MUST paste the exact Sentry rewrite into the file."
