# Agent Directives Graph

> [!NOTE]
> **Architectural Context**
> This is a component-specific technical specification. For the unified master pipeline map and inter-component relationships, please refer to the [V3 Swarming Model Architecture Master Document](v3-swarming-model-architecture.md).

This graph visualizes the relationships between codebase files, the agent directives, instructions, and hints they contain, and the core architectural concepts these rules address. It serves as a comprehensive overview to combat context rot and ensure logical consistency across the multi-agent workspace.

```mermaid
graph TD
  subgraph Codebase Files
    F_0["/workspace/.agents/skills/directive-enforcer/SKILL.md"]
    F_1["/workspace/.agents/workers/directive-enforcer/main.py"]
    F_2["/workspace/docs/agent-directive-enforcer.md"]
    F_3["/workspace/docs/agent-directives-graph.md"]
    F_4["/workspace/docs/features/directive-enforcer-sentry.md"]
    F_5["/workspace/docs/toolchain-prompt/prompt.md"]
    F_6["/workspace/exports/replication/directive-enforcer-replication-blueprint.md"]
    F_7["/workspace/exports/replication/directive-enforcer-replication-starter-templates.md"]
    F_8["/workspace/templates/adk-chat-interface/server.js"]
    F_9["/workspace/templates/cloud-run/node/index.js"]
    F_10["/workspace/templates/docker/node/index.js"]
    F_11["/workspace/wrappers/a2a/main.py"]
    F_12["/workspace/wrappers/mcp/index.js"]
  end

  subgraph Agent Rules
    subgraph Directives
      D_0["[!IMPORTANT] **[Agent Directive: <Domain>]** <A single, concise sentence using MUST, MUST NOT, ALWAYS, or NEVER. No exposition.>"]
      D_1["<agent_directive.*?</agent_directive>"]
      D_2["[!IMPORTANT] **[Agent Directive: Security]** Agents MUST NEVER commit raw Stripe API keys to any branch."]
      D_3["[!IMPORTANT] **[Agent Directive: Core Behavior]** Agents MUST NEVER use slow CLI commands if an MCP server ('ast-analyzer', 'app-tester', 'gcp-logging') can fetch structured data instantly."]
      D_4["[!IMPORTANT] **[Agent Directive: Core Behavior]** Agents MUST NEVER attempt slow, sequential multi-file refactoring; they MUST ALWAYS dispatch parallel sub-agents using the Master Agent Coordinator workflow ('scripts/swarm') when tackling wide changes."]
      D_5["[!IMPORTANT] **[Agent Directive: Core Behavior]** Agents MUST NOT write domain business logic (e.g., React components, Prisma schemas) to this repository; this repository MUST ONLY contain infrastructure, workflow orchestration, and MCP server management code."]
      D_6["[!IMPORTANT] **[Agent Directive: MCP Prioritization]** Agents MUST ALWAYS prioritize specialized MCP tools over sequential filesystem tools ('grep_search', 'view_file')."]
      D_7["[!IMPORTANT] **[Agent Directive: Artifact Validation]** Agents MUST ALWAYS consult the Directive Enforcer Sentry via A2A messaging to validate draft instruction changes BEFORE rewriting any '.md' tool rules or skill files or committing any '.md' artifact updates."]
      D_8["[!IMPORTANT] **[Agent Directive: Scanner Logic]** The scanner MUST identify files for tracking by detecting specific string triggers and MUST extract annotations using the exact provided regex patterns."]
      D_9["[!IMPORTANT] **[Agent Directive: Context Extraction]** The parser MUST extract exactly the first 15 lines of every matched file to ensure LLM context."]
      D_10["[!IMPORTANT] **[Agent Directive: Query Policy]** Master IDE agents MUST query the Sentry's 'get_advice' action BEFORE writing any tool rules or directives."]
      D_11["[!IMPORTANT] **[Agent Directive: Memory Management]** The 'refresh_memory' action MUST be triggered asynchronously on IDE startup or via periodic CI/CD cron jobs to ensure the Memory Graph does not drift from the active filesystem state."]
      D_12["[!IMPORTANT] **[Agent Directive: Conflict Resolution]** If the LLM detects an unresolvable logical loop, the Sentry MUST revert the write and raise a fatal exception outlining the loop to the Master Agent."]
      D_13["[!IMPORTANT] **[Agent Directive: LLM Configuration]** The LLM Engine MUST be configured with a temperature of 0.0."]
      D_14["[!IMPORTANT] **[Agent Directive: Security]** OpenTelemetry initialization MUST NOT be removed."]
      D_15["[!IMPORTANT] **[Agent Directive: Logic]** OpenTelemetry initialization MUST NOT be removed."]
      D_16["[!IMPORTANT] **[Agent Directive: Logic]** The port variable MUST always be assigned using 'process.env.PORT'."]
      D_17["[!IMPORTANT] **[Agent Directive: Logic]** The PORT environment variable MUST ALWAYS be used for port configuration."]
    end

    subgraph Instructions
      I_0["[!NOTE] **[Agent Instruction: <Action Name>]** 1. <Verb-first actionable command> 2. <Verb-first actionable command>"]
      I_1["<agent_instruction.*?</agent_instruction>"]
      I_2["[!NOTE] **[Agent Instruction: Bootstrapping Service]** 1. Read the environment file configuration. 2. Spin up the docker-compose stack. 3. Verify the container health endpoint returns 200."]
      I_3["[!NOTE] **[Agent Instruction: Sentry Consultation Procedure]** 1. When generating new instructions or directives, prepare a draft instruction. 2. Dispatch an HTTP POST request to the Sentry's A2A message endpoint ('http://localhost:8080/a2a/message') with the 'get_advice' action, target filepath, and draft instruction. 3. Review the Sentry's response for evaluation results and the exact, strict Markdown rewrite. 4. Apply the Sentry's rewrite to the target file."]
      I_4["[!NOTE] **[Agent Instruction: Toolchain Doctor Execution]** 1. If the user asks to 'fix the toolchain' or if a git hook fails, run the doctor script. 2. If the doctor reports a missing 'SKILL.md' for a folder, synthesize a new 'SKILL.md' explaining how the AI MUST use the scripts inside that folder. 3. If syntax errors exist in the tools, use coding abilities to fix them. 4. If environment keys are missing, instruct the user on what to add; DO NOT commit secrets. 5. If orphaned script files are found in the root that resemble tools, move them to the script directory."]
      I_5["[!NOTE] **[Agent Instruction: MCP Tool Usage]** 1. Use abstract syntax tree resolution tools (e.g., AST Analyzer) instead of reading whole files to understand components and dependencies. 2. Use sub-agent delegation tools (e.g., Task Delegator) to run parallel agents for wide refactoring. 3. Use context-fetching tools (e.g., Infrastructure Analyzer) for instant architectural and database schema context instead of manually searching configuration files. 4. Use direct MCP log fetchers (e.g., Cloud Logging & Tracing) instead of slow OS-level CLI commands. 5. Use direct MCP SQL/query tools (e.g., Database Actions) instead of manual CLI proxy commands."]
      I_6["[!NOTE] **[Agent Instruction: Autonomous Testing Loop]** 1. If code is modified, analyze the diff scope and run the corresponding pipeline natively via the MCP testing tools. 2. Map specific changes to logical testing bounds (e.g., UI changes trigger unit tests, database changes trigger integration tests). 3. If the MCP testing tool returns an error, catch the stack trace, fix the implementation locally, and recursively re-run the tool until it passes."]
      I_7["[!NOTE] **[Agent Instruction: Memory Analysis]** 1. When tests fail due to memory, scan the logs directory for the latest tracker logs. 2. Compare the 'Top Aggregated Applications' sections between snapshots. 3. If specific tools or databases continuously grow without releasing memory across multiple tests, identify the leak. 4. Apply common fixes, including ensuring database disconnects in test teardowns, checking MCP server LRU caches, or forcing manual garbage collection."]
      I_8["[!NOTE] **[Agent Instruction: Workflow File Creation]** 1. Include standard company boilerplates. 2. Include exact terminal commands to run. 3. Inject the string '// turbo-all' at the top of the file to authorize the AI to execute the bash commands automatically without waiting for user permission."]
      I_9["[!NOTE] **[Agent Instruction: CI/CD Pipeline Creation]** 1. If the user asks to create or deploy a CI/CD pipeline, look in 'docs/templates/pipelines.md' for guidance. 2. NEVER invent a GitHub Actions workflow from scratch; ALWAYS copy the base templates located inside 'templates/pipelines/github-actions/'. 3. If queried about GitHub Actions runners or self-hosted infrastructure, refer the user immediately to 'docs/templates/pipelines/gha-runners.md' for explanations on standard vs. self-hosted runners."]
      I_10["[!NOTE] **[Agent Instruction: Directive Validation]** 1. When drafting new directives, instructions, or hints, agents MUST consult the Directive Enforcer Sentry."]
      I_11["[!NOTE] **[Agent Instruction: Capability Contract]** 1. Recursively scan the codebase, isolating files with annotation triggers, extracting the exact first 15 lines of context, and raw annotations via regex. 2. Offload or inline the JSON graph to an LLM capable of holding massive context windows to evaluate drafts against existing rules. 3. Pass a draft instruction to the LLM; the LLM MUST evaluate Global Conflicts, Logical Loops, and Contextual Alignment, returning a safely rewritten instruction. 4. Rewrite files safely in CI/CD without mutilating surrounding logic."]
      I_12["[!NOTE] **[Agent Instruction: System Prompt Injection]** 1. The primary System Instruction MUST be injected verbatim into the LLM Engine's System Prompt. 2. The Meta-Syntax Formatting Rules MUST be injected verbatim into the LLM Engine's System Prompt. 3. The File Validation Prompt MUST be injected verbatim into the LLM Engine's System Prompt for the 'validate_file' action."]
      I_13["[!NOTE] **[Agent Instruction: Implementation Sequence]** 1. Implement a standalone function to walk directories, ignore artifacts ('node_modules', 'dist'), read target files ('.ts', '.py', '.md'), apply string triggers, and run regex extraction logic. 2. Ensure the resulting JSON graph is written to disk (e.g., '.agents/swarm/directives_graph.json') to act as the primary Source of Truth. 3. Abstract your LLM API; implement logic to either inline the JSON graph into the prompt (for small codebases) or upload the JSON to an LLM Context Cache (for massive codebases). 4. Implement HTTP endpoints (e.g., 'POST /a2a/message') parsing the envelope to route to 'get_advice' or 'validate_file'. 5. Ensure the output stream from the LLM strips backtick fences (```) before writing directly to the disk, preventing file corruption."]
      I_14["[!NOTE] **[Agent Instruction: Verification Requirements]** 1. Create a dummy file with legacy '<agent_directive>' tags and new Markdown Callout tags; assert that the Parser extracts both to the JSON graph. 2. Cache a rule 'A requires B'; submit draft 'B requires A'; assert LLM rejects. 3. Submit draft 'hey, don't forget to close the server'; assert LLM returns exactly the '> [!NOTE]' meta-syntax structure with numbered steps."]
      I_15["[!NOTE] **[Agent Instruction: Sentry Setup]** 1. Integrate an LLM provider (e.g., Gemini Flash, GPT-4o) using the specific Prompts outlined in the Blueprint."]
      I_16["[!NOTE] **[Agent Instruction: API Runtime Integration]** 1. Implement the mechanism to trigger LLM Context Cache uploads. 2. Invoke the LLM with System Prompts from the Blueprint to generate advice for 'get_advice' requests. 3. Invoke the LLM with the 'validate_file' Prompt from the Blueprint to process 'validate_file' requests."]
    end

    subgraph Hints
      H_0["[!TIP] **[Agent Hint: Rationale]** Ambiguity in agent instructions leads to execution failures due to LLM's probabilistic interpretation of nuance."]
      H_1["[!TIP] **[Agent Hint: Directive Nature]** Directives establish high-priority, absolute constraints using terms like MUST or NEVER, typically for security or strict formatting."]
      H_2["[!TIP] **[Agent Hint: Instruction Nature]** Instructions outline sequential or conditional logic, detailing tasks as enumerated, actionable steps."]
      H_3["[!TIP] **[Agent Hint: Hint Nature]** Hints offer non-binding optimization suggestions or contextual background information to aid decision-making."]
      H_4["[!TIP] **[Agent Hint: <Intent>]** <Brief observation or context that aids decision-making, written objectively.>"]
      H_5["[!TIP] **[Agent Hint: Operational Context]** The 'directive-enforcer' operates continuously as a Dockerized A2A microservice."]
      H_6["[!TIP] **[Agent Hint: System Invocation]**"]
      H_7["<agent_hint.*?</agent_hint>"]
      H_8["[!TIP] **[Agent Hint: Context]** The authentication module is mocked in local development. Real Google SSO tokens will intentionally fail validation until deployed."]
      H_9["[!TIP] **[Agent Hint: Resolving Loops]** If you encounter conflicting steps in 'task.md' or a skill instruction, ping the Directive Enforcer A2A interface to scan the workspace and advise on which directive holds precedence."]
      H_10["[!TIP] **[Agent Hint: LLM Engineering]** The effectiveness of this feature is entirely dependent on the precise wording of the LLM prompts."]
      H_11["[!TIP] **[Agent Hint: Context]** Maintaining OpenTelemetry initialization ensures uniformity across hlbw-ai-hub services."]
      H_12["[!TIP] **[Agent Hint: Context]** The default port for Cloud Run environments is 8080."]
    end
  end

  subgraph Core Concepts
    C_0[Meta-Syntax]
    C_1[Directive Definition]
    C_2[Legacy Syntax]
    C_3[Parsing]
    C_4[Security]
    C_5[Data Protection]
    C_6[Performance]
    C_7[MCP Prioritization]
    C_8[Parallelism]
    C_9[Swarm Orchestration]
    C_10[Repository Scope]
    C_11[Architecture]
    C_12[Tool Usage]
    C_13[Sentry Interaction]
    C_14[Artifact Validation]
    C_15[A2A Communication]
    C_16[Scanner Logic]
    C_17[Context Extraction]
    C_18[LLM Context]
    C_19[Query Policy]
    C_20[Memory Management]
    C_21[Graph Refresh]
    C_22[Conflict Resolution]
    C_23[LLM Error Handling]
    C_24[LLM Configuration]
    C_25[OpenTelemetry]
    C_26[Logic]
    C_27[Configuration]
    C_28[Instruction Definition]
    C_29[Bootstrapping]
    C_30[Service Management]
    C_31[Instruction Generation]
    C_32[Toolchain Management]
    C_33[Error Handling]
    C_34[Skill Synthesis]
    C_35[MCP Tool Usage]
    C_36[Context Fetching]
    C_37[Autonomous Testing]
    C_38[Testing Strategy]
    C_39[Debugging]
    C_40[Workflow Creation]
    C_41[Automation]
    C_42[Boilerplate]
    C_43[CI/CD]
    C_44[Templating]
    C_45[Guidance]
    C_46[Directive Validation]
    C_47[Capability Contract]
    C_48[Codebase Scanning]
    C_49[LLM Evaluation]
    C_50[File Rewriting]
    C_51[System Prompt]
    C_52[Implementation]
    C_53[Graph Persistence]
    C_54[LLM Integration]
    C_55[API Design]
    C_56[Verification]
    C_57[Testing]
    C_58[Parser Validation]
    C_59[LLM Validation]
    C_60[Sentry Setup]
    C_61[API Integration]
    C_62[LLM Context Cache]
    C_63[LLM Invocation]
    C_64[Rationale]
    C_65[LLM Behavior]
    C_66[Ambiguity]
    C_67[Directive Nature]
    C_68[Instruction Nature]
    C_69[Hint Nature]
    C_70[Hint Definition]
    C_71[Operational Context]
    C_72[Docker]
    C_73[System Invocation]
    C_74[Context]
    C_75[Authentication]
    C_76[Development Environment]
    C_77[Prompt Design]
    C_78[Uniformity]
    C_79[Cloud Run]
  end

  F_0 -- "contains" --> H_0
  F_0 -- "contains" --> H_1
  F_0 -- "contains" --> H_2
  F_0 -- "contains" --> H_3
  F_0 -- "contains" --> H_4
  F_0 -- "contains" --> H_5
  F_0 -- "contains" --> H_6
  F_0 -- "contains" --> D_0
  F_0 -- "contains" --> I_0
  F_1 -- "contains" --> D_0
  F_1 -- "contains" --> D_1
  F_1 -- "contains" --> I_0
  F_1 -- "contains" --> I_1
  F_1 -- "contains" --> H_4
  F_1 -- "contains" --> H_7
  F_2 -- "contains" --> D_2
  F_2 -- "contains" --> I_2
  F_2 -- "contains" --> H_8
  F_4 -- "contains" --> I_3
  F_5 -- "contains" --> D_3
  F_5 -- "contains" --> D_4
  F_5 -- "contains" --> D_5
  F_5 -- "contains" --> D_6
  F_5 -- "contains" --> I_4
  F_5 -- "contains" --> I_5
  F_5 -- "contains" --> I_6
  F_5 -- "contains" --> I_7
  F_5 -- "contains" --> I_8
  F_5 -- "contains" --> I_9
  F_5 -- "contains" --> I_10
  F_6 -- "contains" --> D_7
  F_6 -- "contains" --> D_8
  F_6 -- "contains" --> D_9
  F_6 -- "contains" --> D_10
  F_6 -- "contains" --> D_11
  F_6 -- "contains" --> D_12
  F_6 -- "contains" --> D_13
  F_6 -- "contains" --> D_0
  F_6 -- "contains" --> D_1
  F_6 -- "contains" --> I_11
  F_6 -- "contains" --> I_12
  F_6 -- "contains" --> I_0
  F_6 -- "contains" --> I_13
  F_6 -- "contains" --> I_14
  F_6 -- "contains" --> H_9
  F_6 -- "contains" --> H_10
  F_6 -- "contains" --> H_4
  F_7 -- "contains" --> D_1
  F_7 -- "contains" --> I_15
  F_7 -- "contains" --> I_16
  F_7 -- "contains" --> I_1
  F_7 -- "contains" --> H_7
  F_8 -- "contains" --> D_14
  F_9 -- "contains" --> D_15
  F_9 -- "contains" --> D_16
  F_9 -- "contains" --> H_11
  F_9 -- "contains" --> H_12
  F_10 -- "contains" --> D_15
  F_10 -- "contains" --> D_17
  F_11 -- "contains" --> D_14
  F_12 -- "contains" --> D_15

  D_0 -- "defines" --> C_0
  D_0 -- "defines" --> C_1
  D_1 -- "relates to" --> C_2
  D_1 -- "relates to" --> C_3
  D_2 -- "enforces" --> C_4
  D_2 -- "enforces" --> C_5
  D_3 -- "enforces" --> C_6
  D_3 -- "enforces" --> C_7
  D_4 -- "enforces" --> C_8
  D_4 -- "enforces" --> C_9
  D_4 -- "enforces" --> C_6
  D_5 -- "enforces" --> C_10
  D_5 -- "enforces" --> C_11
  D_6 -- "enforces" --> C_7
  D_6 -- "enforces" --> C_12
  D_7 -- "enforces" --> C_13
  D_7 -- "enforces" --> C_14
  D_7 -- "enforces" --> C_15
  D_8 -- "enforces" --> C_16
  D_8 -- "enforces" --> C_3
  D_9 -- "enforces" --> C_17
  D_9 -- "enforces" --> C_18
  D_10 -- "enforces" --> C_19
  D_10 -- "enforces" --> C_13
  D_11 -- "enforces" --> C_20
  D_11 -- "enforces" --> C_21
  D_12 -- "enforces" --> C_22
  D_12 -- "enforces" --> C_23
  D_13 -- "enforces" --> C_24
  D_14 -- "enforces" --> C_4
  D_14 -- "enforces" --> C_25
  D_15 -- "enforces" --> C_26
  D_15 -- "enforces" --> C_25
  D_16 -- "enforces" --> C_26
  D_16 -- "enforces" --> C_27
  D_17 -- "enforces" --> C_26
  D_17 -- "enforces" --> C_27

  I_0 -- "defines" --> C_0
  I_0 -- "defines" --> C_28
  I_1 -- "relates to" --> C_2
  I_1 -- "relates to" --> C_3
  I_2 -- "describes" --> C_29
  I_2 -- "describes" --> C_30
  I_3 -- "describes" --> C_13
  I_3 -- "describes" --> C_15
  I_3 -- "describes" --> C_31
  I_4 -- "describes" --> C_32
  I_4 -- "describes" --> C_33
  I_4 -- "describes" --> C_34
  I_5 -- "describes" --> C_35
  I_5 -- "describes" --> C_6
  I_5 -- "describes" --> C_36
  I_6 -- "describes" --> C_37
  I_6 -- "describes" --> C_33
  I_6 -- "describes" --> C_38
  I_7 -- "describes" --> C_20
  I_7 -- "describes" --> C_39
  I_7 -- "describes" --> C_6
  I_8 -- "describes" --> C_40
  I_8 -- "describes" --> C_41
  I_8 -- "describes" --> C_42
  I_9 -- "describes" --> C_43
  I_9 -- "describes" --> C_44
  I_9 -- "describes" --> C_45
  I_10 -- "describes" --> C_46
  I_10 -- "describes" --> C_13
  I_11 -- "describes" --> C_47
  I_11 -- "describes" --> C_48
  I_11 -- "describes" --> C_49
  I_11 -- "describes" --> C_50
  I_12 -- "describes" --> C_51
  I_12 -- "describes" --> C_24
  I_12 -- "describes" --> C_0
  I_13 -- "describes" --> C_52
  I_13 -- "describes" --> C_53
  I_13 -- "describes" --> C_54
  I_13 -- "describes" --> C_55
  I_14 -- "describes" --> C_56
  I_14 -- "describes" --> C_57
  I_14 -- "describes" --> C_58
  I_14 -- "describes" --> C_59
  I_15 -- "describes" --> C_60
  I_15 -- "describes" --> C_54
  I_16 -- "describes" --> C_61
  I_16 -- "describes" --> C_62
  I_16 -- "describes" --> C_63

  H_0 -- "explains" --> C_64
  H_0 -- "explains" --> C_65
  H_0 -- "explains" --> C_66
  H_1 -- "explains" --> C_67
  H_1 -- "explains" --> C_0
  H_2 -- "explains" --> C_68
  H_2 -- "explains" --> C_0
  H_3 -- "explains" --> C_69
  H_3 -- "explains" --> C_0
  H_4 -- "defines" --> C_0
  H_4 -- "defines" --> C_70
  H_5 -- "explains" --> C_71
  H_5 -- "explains" --> C_15
  H_5 -- "explains" --> C_72
  H_6 -- "explains" --> C_73
  H_7 -- "relates to" --> C_2
  H_7 -- "relates to" --> C_3
  H_8 -- "explains" --> C_74
  H_8 -- "explains" --> C_75
  H_8 -- "explains" --> C_76
  H_9 -- "explains" --> C_22
  H_9 -- "explains" --> C_13
  H_9 -- "explains" --> C_15
  H_10 -- "explains" --> C_77
  H_10 -- "explains" --> C_24
  H_11 -- "explains" --> C_74
  H_11 -- "explains" --> C_25
  H_11 -- "explains" --> C_78
  H_12 -- "explains" --> C_74
  H_12 -- "explains" --> C_79
  H_12 -- "explains" --> C_27
```
