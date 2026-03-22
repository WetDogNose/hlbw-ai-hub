# Agent Directives Graph

This graph visualizes the relationships between codebase files, the agent directives, instructions, and hints they contain, and the core architectural concepts these rules address. It serves as a comprehensive overview to combat context rot and ensure logical consistency across the multi-agent workspace.

```mermaid
graph TD
  subgraph Codebase Files
    F_1212121c["/workspace/.agents/skills/directive-enforcer/SKILL.md"]
    F_21212121["/workspace/.agents/workers/directive-enforcer/main.py"]
    F_31313131["/workspace/docs/agent-directive-enforcer.md"]
    F_41414141["/workspace/docs/features/directive-enforcer-sentry.md"]
    F_51515151["/workspace/docs/toolchain-prompt/prompt.md"]
    F_61616161["/workspace/exports/replication/directive-enforcer-replication-blueprint.md"]
    F_71717171["/workspace/exports/replication/directive-enforcer-replication-starter-templates.md"]
    F_81818181["/workspace/templates/adk-chat-interface/server.js"]
    F_91919191["/workspace/templates/cloud-run/node/index.js"]
    F_a1a1a1a1["/workspace/templates/docker/node/index.js"]
    F_b1b1b1b1["/workspace/wrappers/a2a/main.py"]
    F_c1c1c1c1["/workspace/wrappers/mcp/index.js"]
  end
  subgraph Agent Rules
    subgraph Directives
      D_1212121c["Standard Directive Format"]
      D_21212121["Legacy Directive Regex Format"]
      D_31313131["Directive: Security - Agents MUST NEVER commit raw Stripe API keys to any branch."]
      D_41414141["Directive: Core Behavior - Agents MUST NEVER use slow CLI commands if an MCP server (`ast-analyzer`, `app-tester`, `gcp-logging`) can fetch structured data instantly."]
      D_51515151["Directive: Core Behavior - Agents MUST NEVER attempt slow, sequential multi-file refactoring; they MUST ALWAYS dispatch parallel sub-agents using the Master Agent Coordinator workflow (`scripts/swarm`) when tackling wide changes."]
      D_61616161["Directive: Core Behavior - Agents MUST NOT write domain business logic (e.g., React components, Prisma schemas) to this repository; this repository MUST ONLY contain infrastructure, workflow orchestration, and MCP server management code."]
      D_71717171["Directive: MCP Prioritization - Agents MUST ALWAYS prioritize specialized MCP tools over sequential filesystem tools (`grep_search`, `view_file`)."]
      D_81818181["Directive: Artifact Validation - Agents MUST ALWAYS consult the Directive Enforcer Sentry via A2A messaging to validate draft instruction changes BEFORE rewriting any `.md` tool rules or skill files or committing any `.md` artifact updates."]
      D_91919191["Directive: Scanner Logic - The scanner MUST identify files for tracking by detecting specific string triggers and MUST extract annotations using the exact provided regex patterns."]
      D_a1a1a1a1["Directive: Context Extraction - The parser MUST extract exactly the first 15 lines of every matched file to ensure LLM context."]
      D_b1b1b1b1["Directive: Query Policy - Master IDE agents MUST query the Sentry's `get_advice` action BEFORE writing any tool rules or directives."]
      D_c1c1c1c1["Directive: Memory Management - The `refresh_memory` action MUST be triggered asynchronously on IDE startup or via periodic CI/CD cron jobs to ensure the Memory Graph does not drift from the active filesystem state."]
      D_d1d1d1d1["Directive: Conflict Resolution - If the LLM detects an unresolvable logical loop, the Sentry MUST revert the write and raise a fatal exception outlining the loop to the Master Agent."]
      D_e1e1e1e1["Directive: LLM Configuration - The LLM Engine MUST be configured with a temperature of 0.0."]
      D_f1f1f1f1["Directive: Security - OpenTelemetry initialization MUST NOT be removed."]
      D_01010101["Directive: Logic - OpenTelemetry initialization MUST NOT be removed."]
      D_10101010["Directive: Logic - The port variable MUST always be assigned using 'process.env.PORT'."]
      D_20202020["Directive: Logic - The PORT environment variable MUST ALWAYS be used for port configuration."]
    end
    subgraph Instructions
      I_1212121c["Standard Instruction Format"]
      I_21212121["Instruction: Bootstrapping Service - 1. Read the environment file configuration. 2. Spin up the docker-compose stack. 3. Verify the container health endpoint returns 200."]
      I_31313131["Instruction: Sentry Consultation Procedure - 1. When generating new instructions or directives, prepare a draft instruction. 2. Dispatch an HTTP POST request to the Sentry's A2A message endpoint (`http://localhost:8080/a2a/message`) with the `get_advice` action, target filepath, and draft instruction. 3. Review the Sentry's response for evaluation results and the exact, strict Markdown rewrite. 4. Apply the Sentry's rewrite to the target file."]
      I_41414141["Instruction: Toolchain Doctor Execution - 1. If the user asks to 'fix the toolchain' or if a git hook fails, run the doctor script. 2. If the doctor reports a missing `SKILL.md` for a folder, synthesize a new `SKILL.md` explaining how the AI MUST use the scripts inside that folder. 3. If syntax errors exist in the tools, use coding abilities to fix them. 4. If environment keys are missing, instruct the user on what to add; DO NOT commit secrets. 5. If orphaned script files are found in the root that resemble tools, move them to the script directory."]
      I_51515151["Instruction: MCP Tool Usage - 1. Use abstract syntax tree resolution tools (e.g., AST Analyzer) instead of reading whole files to understand components and dependencies. 2. Use sub-agent delegation tools (e.g., Task Delegator) to run parallel agents for wide refactoring. 3. Use context-fetching tools (e.g., Infrastructure Analyzer) for instant architectural and database schema context instead of manually searching configuration files. 4. Use direct MCP log fetchers (e.g., Cloud Logging & Tracing) instead of slow OS-level CLI commands. 5. Use direct MCP SQL/query tools (e.g., Database Actions) instead of manual CLI proxy commands."]
      I_61616161["Instruction: Autonomous Testing Loop - 1. If code is modified, analyze the diff scope and run the corresponding pipeline natively via the MCP testing tools. 2. Map specific changes to logical testing bounds (e.g., UI changes trigger unit tests, database changes trigger integration tests). 3. If the MCP testing tool returns an error, catch the stack trace, fix the implementation locally, and recursively re-run the tool until it passes."]
      I_71717171["Instruction: Memory Analysis - 1. When tests fail due to memory, scan the logs directory for the latest tracker logs. 2. Compare the 'Top Aggregated Applications' sections between snapshots. 3. If specific tools or databases continuously grow without releasing memory across multiple tests, identify the leak. 4. Apply common fixes, including ensuring database disconnects in test teardowns, checking MCP server LRU caches, or forcing manual garbage collection."]
      I_81818181["Instruction: Workflow File Creation - 1. Include standard company boilerplates. 2. Include exact terminal commands to run. 3. Inject the string `// turbo-all` at the top of the file to authorize the AI to execute the bash commands automatically without waiting for user permission."]
      I_91919191["Instruction: CI/CD Pipeline Creation - 1. If the user asks to create or deploy a CI/CD pipeline, look in `docs/templates/pipelines.md` for guidance. 2. NEVER invent a GitHub Actions workflow from scratch; ALWAYS copy the base templates located inside `templates/pipelines/github-actions/`. 3. If queried about GitHub Actions runners or self-hosted infrastructure, refer the user immediately to `docs/templates/pipelines/gha-runners.md` for explanations on standard vs. self-hosted runners."]
      I_a1a1a1a1["Instruction: Directive Validation - 1. When drafting new directives, instructions, or hints, agents MUST consult the Directive Enforcer Sentry."]
      I_b1b1b1b1["Instruction: Capability Contract - 1. Recursively scan the codebase, isolating files with annotation triggers, extracting the exact first 15 lines of context, and raw annotations via regex. 2. Offload or inline the JSON graph to an LLM capable of holding massive context windows to evaluate drafts against existing rules. 3. Pass a draft instruction to the LLM; the LLM MUST evaluate Global Conflicts, Logical Loops, and Contextual Alignment, returning a safely rewritten instruction. 4. Rewrite files safely in CI/CD without mutilating surrounding logic."]
      I_c1c1c1c1["Instruction: System Prompt Injection - 1. The primary System Instruction MUST be injected verbatim into the LLM Engine's System Prompt. 2. The Meta-Syntax Formatting Rules MUST be injected verbatim into the LLM Engine's System Prompt. 3. The File Validation Prompt MUST be injected verbatim into the LLM Engine's System Prompt for the `validate_file` action."]
      I_d1d1d1d1["Instruction: Implementation Sequence - 1. Implement a standalone function to walk directories, ignore artifacts (`node_modules`, `dist`), read target files (`.ts`, `.py`, `.md`), apply string triggers, and run regex extraction logic. 2. Ensure the resulting JSON graph is written to disk (e.g., `.agents/swarm/directives_graph.json`) to act as the primary Source of Truth. 3. Abstract your LLM API; implement logic to either inline the JSON graph into the prompt (for small codebases) or upload the JSON to an LLM Context Cache (for massive codebases). 4. Implement HTTP endpoints (e.g., `POST /a2a/message`) parsing the envelope to route to `get_advice` or `validate_file`. 5. Ensure the output stream from the LLM strips backtick fences (```) before writing directly to the disk, preventing file corruption."]
      I_e1e1e1e1["Instruction: Verification Requirements - 1. Create a dummy file with legacy `<agent_directive>` tags and new Markdown Callout tags; assert that the Parser extracts both to the JSON graph. 2. Cache a rule \"A requires B\"; submit draft \"B requires A\"; assert LLM rejects. 3. Submit draft \"hey, don't forget to close the server\"; assert LLM returns exactly the `> [!NOTE]` meta-syntax structure with numbered steps."]
      I_f1f1f1f1["Instruction: Sentry Setup - 1. Integrate an LLM provider (e.g., Gemini Flash, GPT-4o) using the specific Prompts outlined in the Blueprint."]
      I_01010101["Instruction: API Runtime Integration - 1. Implement the mechanism to trigger LLM Context Cache uploads. 2. Invoke the LLM with System Prompts from the Blueprint to generate advice for `get_advice` requests. 3. Invoke the LLM with the 'validate_file' Prompt from the Blueprint to process `validate_file` requests."]
      I_10101010["Legacy Instruction Regex Format"]
    end
    subgraph Hints
      H_1212121c["Hint: Rationale - Ambiguity in agent instructions leads to execution failures due to LLM's probabilistic interpretation of nuance."]
      H_21212121["Hint: Directive Nature - Directives establish high-priority, absolute constraints using terms like MUST or NEVER, typically for security or strict formatting."]
      H_31313131["Hint: Instruction Nature - Instructions outline sequential or conditional logic, detailing tasks as enumerated, actionable steps."]
      H_41414141["Hint: Hint Nature - Hints offer non-binding optimization suggestions or contextual background information to aid decision-making."]
      H_51515151["Standard Hint Format"]
      H_61616161["Hint: Operational Context - The `directive-enforcer` operates continuously as a Dockerized A2A microservice."]
      H_71717171["Legacy Hint Regex Format"]
      H_81818181["Hint: Context - The authentication module is mocked in local development. Real Google SSO tokens will intentionally fail validation until deployed."]
      H_91919191["Hint: Resolving Loops - If you encounter conflicting steps in `task.md` or a skill instruction, ping the Directive Enforcer A2A interface to scan the workspace and advise on which directive holds precedence."]
      H_a1a1a1a1["Hint: LLM Engineering - The effectiveness of this feature is entirely dependent on the precise wording of the LLM prompts."]
      H_b1b1b1b1["Hint: Context - Maintaining OpenTelemetry initialization ensures uniformity across hlbw-ai-hub services."]
      H_c1c1c1c1["Hint: Context - The default port for Cloud Run environments is 8080."]
    end
  end
  subgraph Core Concepts
    C_1212121c[[Context Rot]]
    C_21212121[[Meta-Syntax Enforcement]]
    C_31313131[[LLM Interaction]]
    C_41414141[[Agent Communication (A2A)]]
    C_51515151[[Telemetry & Observability]]
    C_61616161[[Security]]
    C_71717171[[Codebase Scanning & Parsing]]
    C_81818181[[Conflict Resolution]]
    C_91919191[[MCP Tooling]]
    C_a1a1a1a1[[Parallel Processing]]
    C_b1b1b1b1[[Port Configuration]]
    C_c1c1c1c1[[CI/CD & Deployment]]
    C_d1d1d1d1[[Testing & Debugging]]
    C_e1e1e1e1[[Repository Structure]]
  end
  D_1212121c -- "relates to" --> C_21212121
  D_1212121c -- "relates to" --> C_31313131
  D_21212121 -- "relates to" --> C_21212121
  D_21212121 -- "relates to" --> C_71717171
  D_31313131 -- "relates to" --> C_61616161
  D_41414141 -- "relates to" --> C_91919191
  D_51515151 -- "relates to" --> C_a1a1a1a1
  D_51515151 -- "relates to" --> C_e1e1e1e1
  D_61616161 -- "relates to" --> C_e1e1e1e1
  D_71717171 -- "relates to" --> C_91919191
  D_81818181 -- "relates to" --> C_1212121c
  D_81818181 -- "relates to" --> C_21212121
  D_81818181 -- "relates to" --> C_41414141
  D_81818181 -- "relates to" --> C_e1e1e1e1
  D_91919191 -- "relates to" --> C_71717171
  D_a1a1a1a1 -- "relates to" --> C_31313131
  D_a1a1a1a1 -- "relates to" --> C_71717171
  D_b1b1b1b1 -- "relates to" --> C_31313131
  D_b1b1b1b1 -- "relates to" --> C_41414141
  D_c1c1c1c1 -- "relates to" --> C_1212121c
  D_c1c1c1c1 -- "relates to" --> C_c1c1c1c1
  D_d1d1d1d1 -- "relates to" --> C_31313131
  D_d1d1d1d1 -- "relates to" --> C_81818181
  D_e1e1e1e1 -- "relates to" --> C_31313131
  D_f1f1f1f1 -- "relates to" --> C_51515151
  D_f1f1f1f1 -- "relates to" --> C_61616161
  D_01010101 -- "relates to" --> C_51515151
  D_10101010 -- "relates to" --> C_b1b1b1b1
  D_20202020 -- "relates to" --> C_b1b1b1b1
  I_1212121c -- "relates to" --> C_21212121
  I_21212121 -- "relates to" --> C_c1c1c1c1
  I_21212121 -- "relates to" --> C_d1d1d1d1
  I_31313131 -- "relates to" --> C_21212121
  I_31313131 -- "relates to" --> C_31313131
  I_31313131 -- "relates to" --> C_41414141
  I_41414141 -- "relates to" --> C_e1e1e1e1
  I_41414141 -- "relates to" --> C_61616161
  I_51515151 -- "relates to" --> C_91919191
  I_51515151 -- "relates to" --> C_a1a1a1a1
  I_51515151 -- "relates to" --> C_71717171
  I_61616161 -- "relates to" --> C_d1d1d1d1
  I_71717171 -- "relates to" --> C_d1d1d1d1
  I_81818181 -- "relates to" --> C_e1e1e1e1
  I_91919191 -- "relates to" --> C_c1c1c1c1
  I_a1a1a1a1 -- "relates to" --> C_21212121
  I_a1a1a1a1 -- "relates to" --> C_41414141
  I_b1b1b1b1 -- "relates to" --> C_31313131
  I_b1b1b1b1 -- "relates to" --> C_71717171
  I_b1b1b1b1 -- "relates to" --> C_81818181
  I_b1b1b1b1 -- "relates to" --> C_c1c1c1c1
  I_c1c1c1c1 -- "relates to" --> C_21212121
  I_c1c1c1c1 -- "relates to" --> C_31313131
  I_d1d1d1d1 -- "relates to" --> C_31313131
  I_d1d1d1d1 -- "relates to" --> C_41414141
  I_d1d1d1d1 -- "relates to" --> C_71717171
  I_e1e1e1e1 -- "relates to" --> C_21212121
  I_e1e1e1e1 -- "relates to" --> C_31313131
  I_e1e1e1e1 -- "relates to" --> C_71717171
  I_e1e1e1e1 -- "relates to" --> C_d1d1d1d1
  I_f1f1f1f1 -- "relates to" --> C_31313131
  I_01010101 -- "relates to" --> C_31313131
  I_01010101 -- "relates to" --> C_41414141
  I_10101010 -- "relates to" --> C_21212121
  I_10101010 -- "relates to" --> C_71717171
  H_1212121c -- "relates to" --> C_1212121c
  H_1212121c -- "relates to" --> C_31313131
  H_21212121 -- "relates to" --> C_21212121
  H_21212121 -- "relates to" --> C_61616161
  H_31313131 -- "relates to" --> C_21212121
  H_41414141 -- "relates to" --> C_21212121
  H_51515151 -- "relates to" --> C_31313131
  H_61616161 -- "relates to" --> C_41414141
  H_71717171 -- "relates to" --> C_21212121
  H_71717171 -- "relates to" --> C_71717171
  H_81818181 -- "relates to" --> C_d1d1d1d1
  H_91919191 -- "relates to" --> C_1212121c
  H_91919191 -- "relates to" --> C_41414141
  H_91919191 -- "relates to" --> C_81818181
  H_a1a1a1a1 -- "relates to" --> C_31313131
  H_b1b1b1b1 -- "relates to" --> C_51515151
  H_c1c1c1c1 -- "relates to" --> C_b1b1b1b1
    F_1212121c -- "contains" --> D_1212121c
    F_1212121c -- "contains" --> I_1212121c
    F_1212121c -- "contains" --> H_1212121c
    F_1212121c -- "contains" --> H_21212121
    F_1212121c -- "contains" --> H_31313131
    F_1212121c -- "contains" --> H_41414141
    F_1212121c -- "contains" --> H_51515151
    F_1212121c -- "contains" --> H_61616161
    F_21212121 -- "contains" --> D_1212121c
    F_21212121 -- "contains" --> D_21212121
    F_21212121 -- "contains" --> I_1212121c
    F_21212121 -- "contains" --> I_10101010
    F_21212121 -- "contains" --> H_51515151
    F_21212121 -- "contains" --> H_71717171
    F_31313131 -- "contains" --> D_31313131
    F_31313131 -- "contains" --> I_21212121
    F_31313131 -- "contains" --> H_81818181
    F_41414141 -- "contains" --> I_31313131
    F_51515151 -- "contains" --> D_41414141
    F_51515151 -- "contains" --> D_51515151
    F_51515151 -- "contains" --> D_61616161
    F_51515151 -- "contains" --> D_71717171
    F_51515151 -- "contains" --> I_41414141
    F_51515151 -- "contains" --> I_51515151
    F_51515151 -- "contains" --> I_61616161
    F_51515151 -- "contains" --> I_71717171
    F_51515151 -- "contains" --> I_81818181
    F_51515151 -- "contains" --> I_91919191
    F_51515151 -- "contains" --> I_a1a1a1a1
    F_61616161 -- "contains" --> D_81818181
    F_61616161 -- "contains" --> D_91919191
    F_61616161 -- "contains" --> D_a1a1a1a1
    F_61616161 -- "contains" --> D_b1b1b1b1
    F_61616161 -- "contains" --> D_c1c1c1c1
    F_61616161 -- "contains" --> D_d1d1d1d1
    F_61616161 -- "contains" --> D_e1e1e1e1
    F_61616161 -- "contains" --> D_1212121c
    F_61616161 -- "contains" --> D_21212121
    F_61616161 -- "contains" --> I_b1b1b1b1
    F_61616161 -- "contains" --> I_c1c1c1c1
    F_61616161 -- "contains" --> I_1212121c
    F_61616161 -- "contains" --> I_d1d1d1d1
    F_61616161 -- "contains" --> I_e1e1e1e1
    F_61616161 -- "contains" --> H_91919191
    F_61616161 -- "contains" --> H_a1a1a1a1
    F_61616161 -- "contains" --> H_51515151
    F_71717171 -- "contains" --> D_21212121
    F_71717171 -- "contains" --> I_f1f1f1f1
    F_71717171 -- "contains" --> I_01010101
    F_71717171 -- "contains" --> I_10101010
    F_71717171 -- "contains" --> H_71717171
    F_81818181 -- "contains" --> D_f1f1f1f1
    F_91919191 -- "contains" --> D_01010101
    F_91919191 -- "contains" --> D_10101010
    F_91919191 -- "contains" --> H_b1b1b1b1
    F_91919191 -- "contains" --> H_c1c1c1c1
    F_a1a1a1a1 -- "contains" --> D_01010101
    F_a1a1a1a1 -- "contains" --> D_20202020
    F_b1b1b1b1 -- "contains" --> D_f1f1f1f1
    F_c1c1c1c1 -- "contains" --> D_01010101
```