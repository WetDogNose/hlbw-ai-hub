# Directive Enforcer Agent Documentation

The **Directive Enforcer** is a Python-based A2A worker agent built into `hlbw-ai-hub`. Its primary role is to enforce unambiguous, strict, XML-based structures (Meta-Syntax) on any agent instructions, hints, or directives embedded across the workspace artifacts.

The enforcer resolves ambiguity by rejecting loose natural language prompts (e.g., *"hello agent, don't forget to"*), preventing infinite LLM loops, and consolidating conflicting logic.

## 1. The Three Tiers of Automated Execution

The enforcer validates three strict levels of authority. When modifying configuration files, boilerplates, or documentation, AI agents must use these exact XML tags.

### A. The Agent Directive (The Ironclad Law)

Directives act at the highest priority level and revolve around constraints (e.g., security, strict architectural rules). They use absolute language ("MUST", "NEVER").

**Meta-Syntax Target**:

```xml
<agent_directive priority="[CRITICAL|HIGH]" domain="[Security|Format|Logic]">
  [A single, concise sentence using MUST, MUST NOT, ALWAYS, or NEVER. No exposition.]
</agent_directive>
```

### B. The Agent Instruction (The Standard Operating Procedure)

Instructions define sequential or conditional logic. They break down tasks into enumerable, actionable steps.

**Meta-Syntax Target**:

```xml
<agent_instruction execution_type="[sequential|conditional]" target_action="[Action Name]">
  <step order="1">[Verb-first actionable command]</step>
  <step order="2">[Verb-first actionable command]</step>
</agent_instruction>
```

### C. The Agent Hint (The Contextual Leverage)

Hints provide optimization vectors or contextual background without strictly constraining behavior.

**Meta-Syntax Target**:

```xml
<agent_hint intent="[Optimization|Context|Stylistic]">
  [Brief observation or context that aids decision-making, written objectively.]
</agent_hint>
```

---

## 2. Operating Modes (The Toolchain Doctor)

The Directive Enforcer acts continuously across your workspace, but it can be managed natively via the `toolchain-doctor`. It operates in three distinct modes:

### Mode 1: Identify (Static Auditor)

The default behavior of the toolchain validation step. It reads all `.js`, `.ts`, `.py`, and `.md` files. If it finds loose instructions or legacy prompts without the XML meta-syntax, it will fail the build pipeline.

* **Execution**: `npm run doctor:audit`
* **Result**: Prints the warnings identifying exactly which lines in which files violate the strict syntax constraints.

### Mode 2: Fix (LLM Auto-Healing)

Invokes the **Google GenAI SDK** (using `gemini-2.5-flash`) to actively resolve problems within the files in real-time.

* **Execution**: `npm run doctor:fix`
* **Result**: The agent parses the source code, searches for arbitrary constraints, evaluates existing tags for duplicate logic or looping instructions, and elegantly rewrites the file safely mapping everything to the strict XML tag structure. The original code remains completely untouched.

### Mode 3: Graph (Architectural Mapping)

Extracts all active Agent Directives, Instructions, and Hints from the raw files across the workspace and feeds them to the Gemini LLM to categorize their relationships.

* **Execution**: `npm run doctor:graph`
* **Result**: Exports a comprehensive Mermaid Diagram to `docs/agent-directives-graph.md` mapping how the directives interact with specific domains, files, and core concepts.

---

## 3. Architecture & Location

The Directive Enforcer runs seamlessly alongside the rest of the node-based Master Control Plane but uses an isolated Python ecosystem for high-compute LLM ingestion.

* **Worker Source Code**: `.agents/workers/directive-enforcer/main.py`
* **Dependencies**: Uses `Requirements.txt` (FastAPI, opentelemetry, google-genai) heavily orchestrated by `scripts/bootstrap.mjs` on install.
* **Invocation**: Receives standard A2A Messages via port execution but is also exposed directly via CLI flags in `scripts/toolchain-doctor.js`.
* **Skill Definitions**: The semantic breakdown of the worker is stored in `.agents/skills/directive-enforcer/SKILL.md`.
