---
name: "Directive Enforcer Agent"
description: "A specialized A2A worker agent that audits and enforces rigorous, unambiguous XML-based agent instructions."
---

# Directive Enforcer Agent

This skill deploys an A2A worker agent designed specifically to ensure that all hints, instructions, and directives provided to AI agents across `hlbw-ai-hub`'s artifacts remain unambiguous, non-cyclical, and uniform.

## Background

Ambiguity is the enemy of automation. Agents do not interpret nuance; they execute commands based on token probability. Loose text constraints (like "Hey agent, remember to...") engineer failure into pipelines.

## The Three Tiers of Automated Execution

### 1. The Agent Directive (The Ironclad Law)

Directives act at the highest priority level and usually revolve around constraints (e.g., security, strict formatting rules). They use absolute language ("MUST", "NEVER").

**Meta-Syntax Target**:

```xml
<agent_directive priority="[CRITICAL|HIGH]" domain="[Security|Format|Logic]">
  [A single, concise sentence using MUST, MUST NOT, ALWAYS, or NEVER. No exposition.]
</agent_directive>
```

### 2. The Agent Instruction (The Standard Operating Procedure)

Instructions define sequential or conditional logic. They break down a task into enumerable, actionable steps.

**Meta-Syntax Target**:

```xml
<agent_instruction execution_type="[sequential|conditional]" target_action="[Action Name]">
  <step order="1">[Verb-first actionable command]</step>
  <step order="2">[Verb-first actionable command]</step>
</agent_instruction>
```

### 3. The Agent Hint (The Contextual Leverage)

Hints provide optimization vectors or contextual backgrounds without strictly constraining behavior.

**Meta-Syntax Target**:

```xml
<agent_hint intent="[Optimization|Context|Stylistic]">
  [Brief observation or context that aids decision-making, written objectively.]
</agent_hint>
```

## How To Trigger

The `directive-enforcer` tool can be triggered via standard A2A message dispatch or asynchronously analyzed on the workspace via the `toolchain-doctor`.

```bash
npm run toolchain-doctor -- --audit-directives
```
