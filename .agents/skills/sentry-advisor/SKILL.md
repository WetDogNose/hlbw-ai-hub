---
name: "Sentry Advisory"
description: "A mandatory skill teaching IDE agents to consult the global Directive Enforcer Sentry to validate draft instructions against the entire workspace context."
---

# Sentry Advisory Protocol

As an AI Agent operating within the `hlbw-ai-hub` workspace, your ability to understand precise, granular context decays significantly as the codebase scales across thousands of files and isolated microservices. To eradicate "context rot" and perfectly align parallel multi-agent workflows, you MUST asynchronously consult the **Directive Enforcer A2A Sentry Microservice** *before* you ever write a new active Hint, Instruction, or Directive into any codebase file or documentation.

## How To Trigger `get_advice`

The `directive-enforcer` operates continuously as a Dockerized A2A microservice.

- **Continuous Integration**: It is automatically invoked by the Master Agent Coordinator (`scripts/swarm/manage-worktree.ts`) before any swarm branch is merged into the mainline.
- **Manual Advisory**: Agents and IDEs can POST to `http://localhost:8080/a2a/message` with `action: "get_advice"` to validate draft instructions against the holistic memory graph.

## Generating the Architectural Graph

The Sentry can autonomously reconstruct a comprehensive Mermaid diagram of all active instructions in the repository, mapping them back to their codebase files.

If you have made a major change to the workspace rules or the user specifically requests the architectural graph to be updated, execute the following script. The Sentry container will read the Gemini Context Cache and write the markdown directly to `/workspace/docs/agent-directives-graph.md`.

```javascript
fetch('http://localhost:8080/a2a/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        sender_id: 'antigravity-ide',
        target_id: 'directive-enforcer',
        payload: {
            action: 'generate_graph'
        }
    })
}).then(r => r.json()).then(data => {
    console.log(JSON.stringify(data, null, 2));
}).catch(console.error);
```

## Why Consult the Sentry?
1. **Holistic Omniscience**: The Sentry possesses the entire workspace's logic graph and metadata inside its multi-million token Gemini Context Cache.
2. **Global Conflict Resolution**: The Sentry will loudly warn you if your proposed instruction contradicts an instruction embedded deeply in a file you haven't seen.
3. **Correct Syntax Enforcement**: The Sentry resolves nuance and flawlessly rewrites your draft instruction into the rigorously tested strict Markdown Callout heuristics, removing all future ambiguity.

## When To Use This Skill
You MUST invoke this skill whenever your current objective explicitly involves generating, modifying, or creating new operational rules (such as `[Agent Directive: ...]`, `[Agent Instruction: ...]`, or `[Agent Hint: ...]`).

If you receive tasks to write new operational rules into a file, do not attempt to write them raw. First compose your "draft" intent, then hit the Sentry.

## Execution Sequence (The `get_advice` Action)

To query the Sentry, construct a transient payload containing the target filepath (the absolute path where you intend to put the instruction) and the raw, draft instruction you've composed.

Execute the following Node.js snippet using your `run_command` tool (via standard `-e` string evaluation) to invoke the Sentry container which is listening on `localhost:8080`. 

You MUST dynamically inject your `TARGET_FILEPATH` and `YOUR_DRAFT_INSTRUCTION` into this execution wrapper:

```javascript
const draft = `YOUR_DRAFT_INSTRUCTION`;
const targetPath = `TARGET_FILEPATH`;

fetch('http://localhost:8080/a2a/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        sender_id: 'antigravity-ide',
        target_id: 'directive-enforcer',
        payload: {
            action: 'get_advice',
            target_filepath: targetPath,
            draft_instruction: draft
        }
    })
}).then(r => r.json()).then(data => {
    console.log(JSON.stringify(data, null, 2));
}).catch(console.error);
```

### Applying Sentry Advice

The Sentry will respond detailing whether your instruction creates a logical looping trap or conflicts with a global constraint. It will then return a `response_payload.rewritten_instruction` property containing the perfected markdown alert. 

You MUST use this exact rewritten string precisely as returned when subsequently inserting the instruction into the target file.
