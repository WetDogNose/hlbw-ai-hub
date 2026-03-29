# Directive Enforcer: Sentry Protocol

The Directive Enforcer operates as a permanently running A2A Sentry Microservice. Its primary objective is combating context rot by ensuring all agent hints, instructions, and directives are universally uniform and logically sound across the entire `hlbw-ai-hub` workspace.

## Context Caching

The Sentry persists the entire workspace's logic graph into a `directives_graph.json` and loads it into a **Gemini Context Cache**. This grants the LLM instantaneous, cheap "omniscience" over every rule in every file—allowing it to detect loops or cross-repo conflicts instantly.

## Consulting the Sentry (For IDEs and CLI)

> [!NOTE]
> **[Agent Instruction: Sentry Consultation Procedure]**
>
> 1. When generating new instructions or directives, prepare a draft instruction.
> 2. Dispatch an HTTP POST request to the Sentry's A2A message endpoint (`http://localhost:8080/a2a/message`) with the `get_advice` action, target filepath, and draft instruction.
> 3. Review the Sentry's response for evaluation results and the exact, strict Markdown rewrite.
> 4. Apply the Sentry's rewrite to the target file.

### How The Sentry Evaluates Instructions

When the Sentry receives a `get_advice` or `validate_file` payload, it ensures absolute compliance across the entire workspace by leveraging its holistic memory graph. It explicitly executes four critical validations against the draft instruction:

1. **Eliminating Logical Loops**: By passing the entire JSON graph of the workspace's existing instructions to Gemini's massive Context Cache, the Sentry acts as a semantic cross-referencer. If a drafted rule inadvertently creates a cyclical dependency (e.g., Rule A blocks Rule B, but Rule B is required by Rule A), the LLM detects the circular logic while traversing the graph and flags it for rejection or rewriting.
2. **Preventing Conflicting Logic or Intent**: The Sentry instantly checks the proposed instruction against every other documented rule in the repository. If the instruction contradicts a globally established directive (e.g., trying to use NextAuth when a directive mandates IAP), the Sentry resolves the conflict by enforcing the higher-priority system directive and rejecting the draft.
3. **Ensuring Contextual File Alignment**: The cached JSON graph maps every directive mathematically to its absolute file path *and* the first 15 lines of that file's content. The LLM uses this metadata to understand the exact purpose of the target file. If an agent attempts to insert a backend database querying hint into a purely frontend UI component, the Sentry detects the contextual misalignment and advises the agent to move it.
4. **Enforcing Unambiguous Intent**: The Sentry parser strictly enforces the Markdown Callout standard (e.g., `> [!IMPORTANT] **[Agent Directive: <Domain>]**`). By forcing the LLM to rewrite any draft into this rigid syntactic format using absolute terms (`MUST`, `MUST NOT`, `ALWAYS`, `NEVER`), it strips away loose natural language, prose, and ambiguous phrasing, distilling the intent into an unmistakable, machine-enforceable constraint.

### `get_advice` Interface

You can dispatch a standard HTTP POST request natively to the Sentry container to fetch feedback on a draft instruction.

**Endpoint**: `POST http://localhost:8080/a2a/message` (or the equivalent swarm routing port)

**Payload**:

```json
{
  "sender_id": "google-antigravity-ide",
  "target_id": "directive-enforcer",
  "payload": {
    "action": "get_advice",
    "target_filepath": "src/auth/utils.ts",
    "draft_instruction": "> [!NOTE]\n> **[Agent Instruction: Bypass Auth]**\n> 1. Set bypass tag."
  }
}
```

**Response**:

The Sentry will respond within ~1 second using the Gemini Cache with:

1. An evaluation of whether the instruction logically loops or conflicts with any rule in the entire workspace graph.
2. An evaluation of whether it belongs in `src/auth/utils.ts` or is contextually misaligned.
3. The exact, strict Markdown rewrite of the instruction (preserving all nuance) that you should insert into the file.

### Swarm Validation Integration (`validate_file`)

During continuous integration, the Master Agent Coordinator automatically hits the Sentry via `action: "validate_file"` before merging a sub-agent's worktree. If the sub-agent inserted a conflicting logic block, the Sentry will flag and rewrite it.

---

## Technical Integration

For more information on how this Sentry operates architecturally within the `hlbw-ai-hub` (its Docker integration, deployment, and operation modes), refer to the **[Directive Enforcer Architecture Document](/workspace/docs/agent-directive-enforcer.md)**.

For instructions on how you, as a sub-agent or IDE, must integrate with this microservice, consult the **[Directive Enforcer Sentry Skill](/workspace/.agents/skills/directive-enforcer-sentry/SKILL.md)**.
