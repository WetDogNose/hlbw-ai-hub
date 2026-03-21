# Directive Enforcer Agent Documentation

The **Directive Enforcer** is a Python-based A2A worker agent built into `hlbw-ai-hub`. Its primary role is to enforce unambiguous, strict, Markdown Callout structures (Meta-Syntax) on any agent instructions, hints, or directives embedded across the workspace artifacts.

The enforcer resolves ambiguity by rejecting loose natural language prompts (e.g., *"hello agent, don't forget to"*), preventing infinite LLM loops, and consolidating conflicting logic.

## 1. The Three Tiers of Automated Execution

Because AI agents can easily get confused by legacy comments like `"make sure to run the tests"`, the Directive Enforcer forces all instructions into three distinct, structured Markdown alerts: when modifying configuration files, boilerplates, or documentation.

### The `<agent_directive>` (Markdown `> [!IMPORTANT]`)
These are explicit constraints that act as hard guardrails. They map directly to specific architectural domains (e.g., Security, Formatting, Logic).

**Example:**
```markdown
> [!IMPORTANT]
> **[Agent Directive: Security]**
> Agents MUST NEVER commit raw Stripe API keys to any branch.
```

### The `<agent_instruction>` (Markdown `> [!NOTE]`)
These map to strict execution workflows, breaking down complex tasks into specific chronological steps.

**Example:**
```markdown
> [!NOTE]
> **[Agent Instruction: Bootstrapping Service]**
> 1. Read the environment file configuration.
> 2. Spin up the docker-compose stack.
> 3. Verify the container health endpoint returns 200.
```

### The `<agent_hint>` (Markdown `> [!TIP]`)
These provide vital downstream situational context. They are non-blocking observations that help a future agent safely navigate the codebase.

**Example:**
```markdown
> [!TIP]
> **[Agent Hint: Context]**
> The authentication module is mocked in local development. Real Google SSO tokens will intentionally fail validation until deployed.
```

---

## 2. Operating Modes (The Toolchain Doctor)

The Directive Enforcer acts continuously across your workspace, but it can be managed natively via the `toolchain-doctor`. It operates in three distinct modes:

### Mode 1: Identify (Static Auditor)

The default behavior of the toolchain validation step. It reads all `.js`, `.ts`, `.py`, and `.md` files. If it finds loose instructions or legacy prompts without the XML meta-syntax, it will fail the build pipeline.

*   **Execution**: `npm run doctor:audit`
*   **Result**: Prints the warnings identifying exactly which lines in which files violate the strict syntax constraints.

### Mode 2: Fix (LLM Auto-Healing)

Invokes the **Google GenAI SDK** (using `gemini-2.5-flash`) to actively resolve problems within the files in real-time.

*   **Execution**: `npm run doctor:fix`
*   **Result**: The agent parses the source code, searches for arbitrary constraints, evaluates existing tags for duplicate logic or looping instructions, and elegantly rewrites the file safely mapping everything to the strict Markdown callout structure. The original code remains completely untouched.

### Mode 3: Graph (Architectural Mapping)

Extracts all active Agent Directives, Instructions, and Hints from the raw files across the workspace and feeds them to the Gemini LLM to categorize their relationships.

*   **Execution**: `npm run doctor:graph`
*   **Result**: Exports a comprehensive Mermaid Diagram to `docs/agent-directives-graph.md` mapping how the directives interact with specific domains, files, and core concepts.

---

## 3. Architecture & Location

The Directive Enforcer runs seamlessly alongside the rest of the node-based Master Control Plane but uses an isolated Python ecosystem for high-compute LLM ingestion.

*   **Worker Source Code**: `.agents/workers/directive-enforcer/main.py`
*   **Dependencies**: Uses `Requirements.txt` (FastAPI, opentelemetry, google-genai) heavily orchestrated by `scripts/bootstrap.mjs` on install.
*   **Invocation**: Receives standard A2A Messages via port execution but is also exposed directly via CLI flags in `scripts/toolchain-doctor.js`.
*   **Skill Definitions**: The semantic breakdown of the worker is stored in `.agents/skills/directive-enforcer/SKILL.md`.