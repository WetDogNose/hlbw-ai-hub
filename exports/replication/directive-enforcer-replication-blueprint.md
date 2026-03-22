# Directive Enforcer Sentry Replication Blueprint

## Purpose

This document gives another agent enough detail to recreate the same Directive Enforcer Sentry outcomes in a different toolchain, without requiring specific AI platform bindings or hardcoded conventions.

Target outcomes to replicate:
1. **Context Rot Prevention**: Maintain a global "memory graph" of all established rules, directives, and hints across a codebase.
2. **Ambiguity Elimination**: Automatically rewrite loose, human-like agent instructions into a strict, machine-enforceable meta-syntax (e.g., Markdown Callouts).
3. **Global Conflict Resolution**: Validate any new draft instruction to ensure it doesn't create logical loops or contradict existing rules in unseen files.
4. **Contextual Alignment Check**: Ensure new instructions are placed in logically sound filenames/locations.

## Capability Contract (Must-Haves)

### A. Parser & Graph Builder
- Recursively scan the target codebase for files containing established directives/rules.
- Parse the meta-syntax annotations from files.
- Persist the extracted context (filepath, first N lines of context, list of annotations) into a structured memory graph (e.g., JSON).

### B. Advisory Protocol (`get_advice`)
- Accept a proposed draft instruction and its intended target file path.
- Evaluate the draft against the global memory graph.
- Check 3 criteria: Global Conflict, Logical Loops, Contextual File Alignment.
- Synthesize an exact, strictly formatted rewrite of the instruction matching the meta-syntax.

### C. Continuous Validation (`validate_file`)
- Accept a file path and its current content.
- Identify any ambiguous language or conflicts.
- Mutate the file safely into the strict meta-syntax without altering surrounding application logic.

---

## Reference Architecture

Implement these logical components as a standalone microservice:

1. **Context Scanner**
   - Traverses the filesystem ignoring artifacts (like `node_modules`, `.git`).
   - Extracts instructions using Regex or AST.
   - Builds `directives_graph.json`.

2. **LLM Evaluation Engine**
   - The brain. Requires a heavily engineered system prompt detailing the exact meta-syntax formatting rules.
   - Evaluates drafts against the `directives_graph.json`.

3. **Orchestrator API**
   - `POST /a2a/message` (or similar) to receive requests from IDEs or sub-agents.
   - Routes actions: `refresh_memory`, `get_advice`, `validate_file`.

4. **Context Caching Layer (Adapter)**
   - Because codebases can yield massive memory graphs, the architecture MUST support passing the graph to the LLM.
   - For small codebases: Inlines the JSON graph into the prompt.
   - For massive codebases: Hands off to a Provider-specific Context Caching API.

---

## Data Models

### Annotated File Record
- `filepath` (string)
- `context_metadata` (string, e.g., first 15 lines of the file for LLM contextual grounding)
- `annotations` (object)
  - `directives` (array of strings)
  - `instructions` (array of strings)
  - `hints` (array of strings)
  - `has_unstructured_legacy` (boolean)

### A2A Message Request (Advisory)
- `sender_id` (string)
- `target_id` (string)
- `payload` (object)
  - `action`: "get_advice"
  - `target_filepath`: "src/main.ts"
  - `draft_instruction`: "make sure to close the db connection"

### A2A Message Response
- `status` (string)
- `response_payload` (object)
  - `advice`: "Global Validation passed. Rewrite: > [!IMPORTANT]..."

---

## Provider-Neutral Adapter Strategies

Your engine requires an LLM capable of deep reasoning. Since large projects will exceed standard context windows safely, you must abstract the LLM interface.

**Cache Manager Interface**:
- `upload_and_cache_graph(graph_json_path) -> bool`
- `generate_content(prompt, temperature=0.0) -> string`

If the JSON is small (< 100k), the adapter inlines the text. If large, the adapter leverages an underlying platform token caching mechanism (e.g., Gemini Context Caching, Anthropics Prompt Caching) internally without bleeding SDK specifics into the Enforcer logic.

---

## Security & Governance

1. **Read-Only Safeties**: The `get_advice` and graph generation endpoints MUST NOT write to the codebase. Only `validate_file` (typically triggered in CI) modifies files.
2. **Deterministic Rewrites**: The LLM evaluation step MUST use `temperature: 0.0`. Instructions are constraints, not creative outputs.
3. **No Code Mutilation**: In `validate_file`, ensure the prompt strictly forces the LLM to return the RAW file with only the instruction blocks changed without injecting markdown code block fences over the whole file.

---

## Verification Requirements (Definition of Done)

To pass compliance, the new toolchain's Enforcer MUST pass these contract tests:

1. **Circular Dependency Test**: Formulate a draft rule "A requires B". Submit another draft rule "B requires A". The LLM Engine MUST reject or clearly flag the logical loop.
2. **Conflict Test**: If file `auth.ts` has an established Directive "NEVER use JWTs", and a draft instruction proposes "Sign the payload with JWT" in `user.ts`, the Enforcer MUST reject it based on cross-file conflict.
3. **Syntax Rewrite Test**: Submit a draft "hey, don't forget to close the server". The Enforcer MUST reliably return the strictly formatted meta-syntax equivalent (`> [!NOTE]...`).
