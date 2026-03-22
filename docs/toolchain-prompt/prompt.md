# Master AI Toolchain Blueprint

**System Prompt Directive for AI Agents:**
You are working in the `hlbw-ai-hub` repository. This is the **Master Agent Control Plane**.
This document is a technical blueprint detailing the exact agent instructions, scripts, and Model Context Protocol (MCP) servers necessary to achieve a high-velocity, self-healing, autonomous development environment across the entire organization.

**CORE HUB BEHAVIORS (CRITICAL):**
> [!IMPORTANT]
> **[Agent Directive: Core Behavior]**
> Agents MUST NEVER use slow CLI commands if an MCP server (`ast-analyzer`, `app-tester`, `gcp-logging`) can fetch structured data instantly.

> [!IMPORTANT]
> **[Agent Directive: Core Behavior]**
> Agents MUST NEVER attempt slow, sequential multi-file refactoring; they MUST ALWAYS dispatch parallel sub-agents using the Master Agent Coordinator workflow (`scripts/swarm`) when tackling wide changes.

> [!IMPORTANT]
> **[Agent Directive: Core Behavior]**
> Agents MUST NOT write domain business logic (e.g., React components, Prisma schemas) to this repository; this repository MUST ONLY contain infrastructure, workflow orchestration, and MCP server management code.

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
> [!NOTE]
> **[Agent Instruction: Toolchain Doctor Execution]**
> 1. If the user asks to 'fix the toolchain' or if a git hook fails, run the doctor script.
> 2. If the doctor reports a missing `SKILL.md` for a folder, synthesize a new `SKILL.md` explaining how the AI MUST use the scripts inside that folder.
> 3. If syntax errors exist in the tools, use coding abilities to fix them.
> 4. If environment keys are missing, instruct the user on what to add; DO NOT commit secrets.
> 5. If orphaned script files are found in the root that resemble tools, move them to the script directory.

## Pillar 2. Model Context Protocol (MCP) Optimizations

To stop the AI from slowly grepping files or reading massive source codes sequentially, you must build AI preference directives.

**1. Create the AI Skill (`.agents/skills/mcp-optimizations/SKILL.md`):**
Write strict instructions for the AI Agent:
> [!IMPORTANT]
> **[Agent Directive: MCP Prioritization]**
> Agents MUST ALWAYS prioritize specialized MCP tools over sequential filesystem tools (`grep_search`, `view_file`).

> [!NOTE]
> **[Agent Instruction: MCP Tool Usage]**
> 1. Use abstract syntax tree resolution tools (e.g., AST Analyzer) instead of reading whole files to understand components and dependencies.
> 2. Use sub-agent delegation tools (e.g., Task Delegator) to run parallel agents for wide refactoring.
> 3. Use context-fetching tools (e.g., Infrastructure Analyzer) for instant architectural and database schema context instead of manually searching configuration files.
> 4. Use direct MCP log fetchers (e.g., Cloud Logging & Tracing) instead of slow OS-level CLI commands.
> 5. Use direct MCP SQL/query tools (e.g., Database Actions) instead of manual CLI proxy commands.

## Pillar 3. Autonomous Testing & Validation

The AI must be able to run distinct testing tiers natively via MCP without resorting to bash terminals.

**1. Create the MCP Server Wrapper:**
Build a local Model Context Protocol server that wraps your repository's testing commands (e.g., Unit, Integration, E2E, Types/Linting) and exposes them as tools to the AI.

**2. Create the AI Skill (`.agents/skills/app-tester/SKILL.md`):**
Instruct the AI on the autonomous testing loop:
> [!NOTE]
> **[Agent Instruction: Autonomous Testing Loop]**
> 1. If code is modified, analyze the diff scope and run the corresponding pipeline natively via the MCP testing tools.
> 2. Map specific changes to logical testing bounds (e.g., UI changes trigger unit tests, database changes trigger integration tests).
> 3. If the MCP testing tool returns an error, catch the stack trace, fix the implementation locally, and recursively re-run the tool until it passes.

## Pillar 4. Systems-Level Memory Tracking

AI testing loops can cause Out-Of-Memory (OOM) errors. Provide a way for the AI to track memory growth.

**1. Create the memory wrapper logic:**
Modify your test run scripts to pipe execution through a memory tracker that outputs snapshot logs to a dedicated `logs/` directory.

**2. Create the AI Skill (`.agents/skills/memory-analyzer/SKILL.md`):**
Instruct the AI:
> [!NOTE]
> **[Agent Instruction: Memory Analysis]**
> 1. When tests fail due to memory, scan the logs directory for the latest tracker logs.
> 2. Compare the 'Top Aggregated Applications' sections between snapshots.
> 3. If specific tools or databases continuously grow without releasing memory across multiple tests, identify the leak.
> 4. Apply common fixes, including ensuring database disconnects in test teardowns, checking MCP server LRU caches, or forcing manual garbage collection.

## Pillar 5. Environment & Infrastructure Tooling

Automate the mundane setup and configuration tasks via explicit skills:

*   **Bootstrap Environment (`.agents/skills/bootstrap-environment/SKILL.md`):** Instructs the AI to autonomously install dependencies and handle external service authentication upon initial clone.
*   **Coverage Reporter (`.agents/skills/coverage-reporter/SKILL.md`):** Instructs the AI to run comprehensive test coverage commands and write reports into the logs directory for the user.
*   **Production Database Triage (`.agents/skills/production-db-triage/SKILL.md`):** Links to a read-only MCP tool allowing the agent to safely read live user states without writing destructive commands.
*   **Repo Cleaner (`.agents/skills/repo-cleaner/SKILL.md`):** A skill pointing to a cleanup script to purge old logs, test coverage outputs, and temporary files.

## Pillar 6. Turbo-Enabled Workflows (`.agents/workflows/`)

Establish a directory of standardized `.md` files that the AI can execute without user prompting.

**1. Create Workflow Markdown Files:**
For every repetitive task, create a markdown file (e.g., `.agents/workflows/scaffold-component.md`).
> [!NOTE]
> **[Agent Instruction: Workflow File Creation]**
> 1. Include standard company boilerplates.
> 2. Include exact terminal commands to run.
> 3. Inject the string `// turbo-all` at the top of the file to authorize the AI to execute the bash commands automatically without waiting for user permission.

**Examples to include:**
- Scaffolding new components or modules.
- Scaffolding new API endpoints.
- Running database migrations.
- Automated deployment and version tagging.

## Pillar 7. CI/CD Pipeline & Workflow Templates

Standardize how pipelines and runner environments are built to prevent ad-hoc and brittle configurations.

**1. Update Agent Directives:**
> [!NOTE]
> **[Agent Instruction: CI/CD Pipeline Creation]**
> 1. If the user asks to create or deploy a CI/CD pipeline, look in `docs/templates/pipelines.md` for guidance.
> 2. NEVER invent a GitHub Actions workflow from scratch; ALWAYS copy the base templates located inside `templates/pipelines/github-actions/`.
> 3. If queried about GitHub Actions runners or self-hosted infrastructure, refer the user immediately to `docs/templates/pipelines/gha-runners.md` for explanations on standard vs. self-hosted runners.

## Pillar 8. Agent Directive Enforcement (Sentry Validation)

To eliminate "context rot" and perfectly align multi-agent workflows, all rules, hints, and instructions for other agents MUST be rigorously verified and converted to explicit Markdown Callouts.

**1. Create the AI Skill (`.agents/skills/directive-enforcer-sentry/SKILL.md`):**
Instruct the AI on the architectural validation loop:
> [!NOTE]
> **[Agent Instruction: Directive Validation Loop]**
> 1. If writing a new Agent Directive (`> [!IMPORTANT]`), Agent Instruction (`> [!NOTE]`), or Agent Hint (`> [!TIP]`), DO NOT write it directly to the file based on intuition.
> 2. Execute the `directive-enforcer-sentry` payload snippet to query the continuous A2A Sentry microservice (`http://localhost:8080/a2a/message`).
> 3. The Sentry will rewrite the instruction to prevent logical loops and context collisions across the entire massive workspace; paste the exact Sentry rewrite into the file.