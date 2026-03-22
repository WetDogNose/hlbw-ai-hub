# Directive Enforcer: Sentry Advisory Protocol

The Directive Enforcer operates as a permanently running A2A Sentry Microservice. Its primary objective is combating context rot by ensuring all agent hints, instructions, and directives are universally uniform and logically sound across the entire `hlbw-ai-hub` workspace.

## Context Caching

The Sentry persists the entire workspace's logic graph into a `directives_graph.json` and loads it into a **Gemini Context Cache**. This grants the LLM instantaneous, cheap "omniscience" over every rule in every file—allowing it to detect loops or cross-repo conflicts instantly.

## Consulting the Sentry (For IDEs and CLI)

As an agent, if you are generating *new* instructions/directives for a user, you MUST consult the Sentry *before* writing the file or committing to git. This guarantees your instruction doesn't violate existing domain heuristics.

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
