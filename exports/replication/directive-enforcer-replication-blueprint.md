# Directive Enforcer Sentry Replication Blueprint

## Purpose

Maintain a global "memory graph" of all established rules, directives, and hints across a codebase to prevent context rot. Automatically rewrite loose, human-like agent instructions into a strict, machine-enforceable meta-syntax while globally resolving logic conflicts.

## Capability Contract

1. **Parser & Graph Builder**: Recursively scan the codebase, isolating files with annotation triggers, extracting the exact first 15 lines of context, and the raw annotations via regex.
2. **Context Caching Layer**: Offload or inline the JSON graph to an LLM capable of holding massive context windows to evaluate drafts against existing rules.
3. **Advisory Validation (`get_advice`)**: Pass a draft instruction to the LLM. The LLM MUST evaluate Global Conflicts, Logical Loops, and Contextual Alignment, returning a safely rewritten instruction.
4. **Continuous Validation (`validate_file`)**: Rewrite files safely in CI/CD without mutilating surrounding logic.

---

## Core Logic & Heuristics

The scanner MUST identify files requiring tracking by detecting specific string triggers and MUST extract annotations via the following exact regex patterns. Do not deviate from these patterns.

**Detection Triggers**:
- `**[agent `
- `<agent_`
- Legacy triggers: `hey agent`, `agent: remember`, `@agent`, `system prompt directive`

**Extraction Regex (Python standard)**:
- Directives: `r'> \[\!IMPORTANT\].*?\n(?:> .*?\n)+'`
- Instructions: `r'> \[\!NOTE\].*?\n(?:> .*?\n)+'`
- Hints: `r'> \[\!TIP\].*?\n(?:> .*?\n)+'`
- Legacy D/I/H: `r'<agent_directive.*?</agent_directive>'` (with DOTALL)

**Context Windowing**:
For every matched file, extract exactly the first 15 lines (`splitlines()[:15]`). This guarantees the LLM understands the file's primary purpose.

---

## Data Models

### Annotated File Record Schema
```json
{
  "context_metadata": "<string: first 15 lines of the file>",
  "annotations": {
    "directives": ["<string: matched regex block>", "..."],
    "instructions": ["<string: matched regex block>", "..."],
    "hints": ["<string: matched regex block>", "..."],
    "has_unstructured_legacy": "<boolean>"
  }
}
```

### A2A Protocol Envelope
```json
{
  "sender_id": "<string>",
  "target_id": "directive-enforcer",
  "payload": {
    "action": "get_advice | validate_file | refresh_memory",
    "target_filepath": "<string>",
    "draft_instruction": "<string>"
  }
}
```

---

## System Prompts & LLM Engineering

The core value of this feature rests completely on the exact wording of the LLM prompts. **You must configure your LLM Engine with temperature 0.0 and the following exact System Instruction:**

```text
You are the Directive Enforcer A2A Agent, the Sentry of the workspace.
Primary Objective: Combat context rot in multi-agent massive context codebases. Context effectiveness must be prioritized!

You will be provided with a cached JSON graph of ALL directives, instructions, and hints across the entire workspace, including their file paths and contextual metadata.

When evaluating a draft instruction or a file modification, you MUST strictly check the following criteria:
1. Global Conflict Check: Does this new/draft directive conflict with ANY other directive in the entire cached workspace graph?
2. Logical Loops & Redundancy: Does this create a loop or redundantly state an existing rule?
3. Contextual Alignment: Given the file's path and metadata in the graph, does this directive belong in THIS file? Or is it misaligned and belongs elsewhere?

CRITICAL RULE FOR MIGRATION/ADVISORY:
If rewriting or migrating an instruction to the new markdown format, you MUST NOT lose any fine-grained detail, specificity, or nuance. Preserve every exact technical constraint and condition.
```

**Meta-Syntax Formatting Rules (Inject these into the System Prompt):**
```text
RULE: DIRECTIVE GENERATION
When inserting constraints or absolute rules into an artifact, you MUST use the following syntactic standard to ensure downstream compliance. Never output loose constraints.
Format:
> [!IMPORTANT]
> **[Agent Directive: <Domain>]**
> <A single, concise sentence using MUST, MUST NOT, ALWAYS, or NEVER. No exposition.>

RULE: INSTRUCTION GENERATION
When inserting execution steps or procedural logic into an artifact, you MUST use the following syntactic standard. Avoid paragraph explanations; use strict, enumerated logical steps.
Format:
> [!NOTE]
> **[Agent Instruction: <Action Name>]**
> 1. <Verb-first actionable command>
> 2. <Verb-first actionable command>

RULE: HINT GENERATION
When inserting context, background information, or optimization suggestions into an artifact, you MUST use the following syntactic standard. Clearly label the intent so downstream parsers understand it is non-blocking.
Format:
> [!TIP]
> **[Agent Hint: <Intent>]**
> <Brief observation or context that aids decision-making, written objectively.>
```

**File Validation Prompt (`validate_file` action):**
```text
EVALUATE AND MIGRATE ENTIRE FILE:
Target File: {filepath}

1. Evaluate all agent rules in this file against the global graph for contextual alignment and conflicts.
2. If conflicts or loops exist, rewrite the rules safely.
3. If legacy tags or ambiguous wording exist, migrate them to the new Markdown Callout standard.
4. CRITICAL: Preserve all original nuance and specific constraints when rewriting.
5. ONLY output the raw file content, preserving all other native code and logic perfectly. Do not wrap in markdown codeblocks.

File Content:
{content}
```

---

## Step-by-Step Implementation Sequence

1. **Build the Parser**: Implement a standalone function to walk directories, ignore artifacts (`node_modules`, `dist`), read target files (`.ts`, `.py`, `.md`), apply the string triggers, and run the regex extraction logic.
2. **Setup Persistent Storage**: Ensure the resulting JSON graph is written to disk (e.g., `.agents/swarm/directives_graph.json`) to act as the primary Source of Truth.
3. **Build LLM Adapter**: Abstract your LLM API. Implement logic to either inline the JSON graph into the prompt (for small codebases) or upload the JSON to an LLM Context Cache (for massive codebases).
4. **Stand up API Routing**: Implement HTTP endpoints (e.g., `POST /a2a/message`) parsing the envelope to route to `get_advice` or `validate_file`.
5. **Implement `validate_file` Sanitization**: Ensure the output stream from the LLM strips backtick fences (```) before writing directly to the disk, preventing file corruption.

---

## Verification Requirements (Definition of Done)

1. **Parser Integrity Test**: Create a dummy file with legacy `<agent_directive>` tags and new Markdown Callout tags. Assert that the Parser exacts both to the JSON graph.
2. **Circular Dependency Test**: Cache a rule "A requires B". Submit draft "B requires A". Assert LLM rejects.
3. **Format Rigidity Test**: Submit draft "hey, don't forget to close the server". Assert LLM returns exactly the `> [!NOTE]` meta-syntax structure with numbered steps.
4. **File Mutilation Test (`validate_file`)**: Submit a 500-line TypeScript file with a single rule. Assert the output file contains the exactly translated rule and perfectly preserves the other 495 lines of TypeScript logic.
