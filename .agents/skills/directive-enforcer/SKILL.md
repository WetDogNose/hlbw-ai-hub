---
name: "Directive Enforcer Agent"
description: "A specialized A2A worker agent that audits and enforces rigorous, unambiguous Markdown Callout-based agent instructions."
---

# Directive Enforcer Agent

This skill deploys an A2A worker agent designed specifically to ensure that all hints, instructions, and directives provided to AI agents across `hlbw-ai-hub`'s artifacts remain unambiguous, non-cyclical, and uniform.

> [!TIP]
> **[Agent Hint: Rationale]**
> Ambiguity in agent instructions leads to execution failures due to LLM's probabilistic interpretation of nuance.

## The Three Tiers of Automated Execution

### 1. The Agent Directive (The Ironclad Law)

> [!TIP]
> **[Agent Hint: Directive Nature]**
> Directives establish high-priority, absolute constraints using terms like MUST or NEVER, typically for security or strict formatting.

**Meta-Syntax Target (Markdown Callout Standard)**:

> [!IMPORTANT]
> **[Agent Directive: `<Domain>`]**
> `<A single, concise sentence using MUST, MUST NOT, ALWAYS, or NEVER. No exposition.>`

### 2. The Agent Instruction (The Standard Operating Procedure)

> [!TIP]
> **[Agent Hint: Instruction Nature]**
> Instructions outline sequential or conditional logic, detailing tasks as enumerated, actionable steps.

**Meta-Syntax Target (Markdown Callout Standard)**:

> [!NOTE]
> **[Agent Instruction: `<Action Name>`]**
> 
> 1. `<Verb-first actionable command>`
> 2. `<Verb-first actionable command>`

### 3. The Agent Hint (The Contextual Leverage)

> [!TIP]
> **[Agent Hint: Hint Nature]**
> Hints offer non-binding optimization suggestions or contextual background information to aid decision-making.

**Meta-Syntax Target (Markdown Callout Standard)**:

> [!TIP]
> **[Agent Hint: `<Intent>`]**
> `<Brief observation or context that aids decision-making, written objectively.>`

## How To Trigger

> [!TIP]
> **[Agent Hint: Operational Context]**
> The `directive-enforcer` operates continuously as a Dockerized A2A microservice.

> [!TIP]
> **[Agent Hint: System Invocation]**
> The Directive Enforcer is automatically invoked by the Master Agent Coordinator (`scripts/swarm/manage-worktree.ts`) before any swarm branch is merged into the mainline.

> [!NOTE]
> **[Agent Instruction: Manual Validation]**
> 1. To validate draft instructions against the holistic memory graph, POST to `http://localhost:8080/a2a/message`.
> 2. Ensure the payload includes `action: "get_advice"`.