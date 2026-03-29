---
description: How to scaffold a new React Component with standard Wot-Box boilerplate and styling
---
// turbo-all

This workflow is completely auto-running as it only involves safe scaffolding.

1. Parse the requested component Name and Domain (e.g. `UploadButton` in `components/ui`).
2. Run standard bash commands to create or ensure the directory exists.
3. Automatically create the basic `{ComponentName}.tsx` file using Node.js script.
4. Auto-inject the initial React boilerplate `export default function {ComponentName}()`.
5. Write an associated basic comment block describing the component props above the definition.


> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.

> [!TIP]
> **Agent Efficiency Hint:** When dealing with component props, shared interfaces, or wanting to see how existing UI components are styled, use `get_symbol_definition` from the `ast-analyzer-mcp` instead of manually searching and reading files. It provides instant, targeted context.