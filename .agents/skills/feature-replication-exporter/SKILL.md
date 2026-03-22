---
name: Feature Replication Exporter
description: Exports toolchain features as comprehensive, toolchain-agnostic markdown blueprints and starter templates for other agents to recreate.
---

# Feature Replication Exporter Instructions

This skill enables you to act as a "Feature Exporter" capable of mapping an existing complex toolchain feature (like Swarming, Observability, or Directive Enforcement) and generating clean, toolchain-agnostic blueprints and starter templates. These exports allow another AI agent to reconstruct the exact same capabilities in a completely different language stack or repository.

When you are instructed to use this skill, follow these exact steps to ensure a robust, high-quality export:

### Step 1: Context Gathering & Deep Code Analysis
1. Extensively research the requested feature in the current repository using tools like `grep_search`, `find_by_name`, and `ast-analyzer`.
2. Map out the feature's complete architecture: identify the orchestration logic, data models, configuration schemas, API/tool boundaries, wrappers, and required dependencies.
3. Identify external systems (e.g., Google Cloud Platform, Identity services, Docker, LLM Providers, databases) that the feature binds to.

### Step 2: Self-Reflection & Abstraction (Sequential Thinking)
Before you generate any markdown files, take a moment to reason through the feature's core essence:
1. Strip out repository-specific cruft, private enterprise logic (e.g., ANZ-specific CI/CD or identity concepts), and hardcoded IDs.
2. Determine the fundamental **Capability Contract** required to make this feature work.
3. Define strong **Adapter Layers** for any external systems you identified in Step 1. The replication should never bind directly to a specific provider if an abstraction is safer.

### Step 3: Generate the Replication Blueprint
Create a comprehensive blueprint file named `exports/replication/<feature-name>-replication-blueprint.md`. This file must act as a complete, deeply technical architecture and constraint document that leaves ZERO ambiguity for the receiving agent.

Ensure the blueprint includes at minimum:
- **Feature Intent**: A key description of the primary role and intent of the feature (e.g., "The Directive Enforcer is a Python-based A2A worker agent... Its primary role is to enforce unambiguous, strict Meta-Syntax... The enforcer resolves ambiguity by rejecting loose prompts...").
- **Purpose & Target Outcomes**: High-level target outcomes to replicate.
- **Integration Points**: Exactly where and how this feature is wired into the broader ecosystem/toolchain to function properly.
- **Agent Triggers (Hints, Directives, Instructions)**: The exact agent hints, directives, and instructions required to reliably integrate it and have it triggered by agents at the right time.
- **Capability Contract**: What the feature *must* be able to do.
- **Reference Architecture**: How abstract components (services, stores, adapters) logically interact.
- **Data Models**: Agnostic schemas of the state/data structures (include exact required fields).
- **Core Logic & Heuristics**: If the feature relies on specific regex, parsing rules, or algorithms, YOU MUST include the exact technical logic in the blueprint.
- **System Prompts & LLM Engineering**: If the feature relies on LLMs, provide the EXACT system prompts and constraint rules required to make it work.
- **Tool/API Surface**: The exact interfaces, endpoints, and JSON schemas the agent or user will call.
- **Scheduling/Decision Policies** (if applicable): Explicit rules on how system state transitions occur.
- **Step-by-Step Implementation Sequence**: A granular, chronological checklist for an agent to follow, reducing all ambiguity over what to build first.
- **Verification Requirements**: A firm "Definition of Done" and a list of detailed contract tests the receiving toolchain *must* pass to prove compliance.

### Step 4: Generate the Starter Templates
Create a paired starter core logic file named `exports/replication/<feature-name>-replication-starter-templates.md`. 
1. Provide functional, production-grade code implementations demonstrating how to build the core engine of the blueprint in at least 2 relevant modern tech stacks (e.g., Python + TypeScript).
2. **DO NOT USE EMPTY STUBS.** Your starter templates must contain fleshed-out core logic (e.g., actual file parsing routines, actual HTTP routing, actual adapter interface wiring). Instead of `// Stub: do X`, write the code that does X based on your deep code analysis.

### Step 5: Final Packaging & Output
1. Write the previous step outputs to the `exports/replication/` directory (create the directory if it does not exist using the file writing tool).
2. Optionally, write an `exports/replication/index.md` summarizing what was exported and how the receiving agent should invoke these documents.
3. Notify the user that the replication export is complete and provide them with the paths to the generated files.

> [!TIP]
> **Quality assurance:** The standard for these exports is extremely high. They must read like professional, agnostic system architecture documents. Do not just copy-paste existing code; translate it into a portable blueprint.
