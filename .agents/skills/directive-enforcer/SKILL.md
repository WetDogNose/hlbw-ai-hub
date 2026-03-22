---
name: "Directive Enforcer Agent"
description: "A specialized A2A worker agent that audits and enforces rigorous, unambiguous Markdown Callout-based agent instructions."
---

# Directive Enforcer Agent

This skill deploys an A2A worker agent designed specifically to ensure that all hints, instructions, and directives provided to AI agents across `hlbw-ai-hub`'s artifacts remain unambiguous, non-cyclical, and uniform.

## Background

Ambiguity is the enemy of automation. Agents do not interpret nuance; they execute commands based on token probability. Loose text constraints (like "Hey agent, remember to...") engineer failure into pipelines.

## The Three Tiers of Automated Execution

### 1. The Agent Directive (The Ironclad Law)

Directives act at the highest priority level and usually revolve around constraints (e.g., security, strict formatting rules). They use absolute language ("MUST", "NEVER").

**Meta-Syntax Target (Markdown Callout Standard)**:

> [!IMPORTANT]
> **[Agent Directive: `<Domain>`]**
> `<A single, concise sentence using MUST, MUST NOT, ALWAYS, or NEVER. No exposition.>`

### 2. The Agent Instruction (The Standard Operating Procedure)

Instructions define sequential or conditional logic. They break down a task into enumerable, actionable steps.

**Meta-Syntax Target (Markdown Callout Standard)**:

> [!NOTE]
> **[Agent Instruction: `<Action Name>`]**
> 
> 1. `<Verb-first actionable command>`
> 2. `<Verb-first actionable command>`

### 3. The Agent Hint (The Contextual Leverage)

Hints provide optimization vectors or contextual backgrounds without strictly constraining behavior.

**Meta-Syntax Target (Markdown Callout Standard)**:

> [!TIP]
> **[Agent Hint: `<Intent>`]**
> `<Brief observation or context that aids decision-making, written objectively.>`

## How To Trigger

The `directive-enforcer` operates continuously as a Dockerized A2A microservice.

- **Continuous Integration**: It is automatically invoked by the Master Agent Coordinator (`scripts/swarm/manage-worktree.ts`) before any swarm branch is merged into the mainline.
- **Manual Advisory**: Agents and IDEs can POST to `http://localhost:8080/a2a/message` with `action: "get_advice"` to validate draft instructions against the holistic memory graph.