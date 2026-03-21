---
name: Toolchain Documenter
description: Analyzes the current toolchain capabilities (skills, workflows, MCP servers) and regenerates the Wot-Box Toolchain Capabilities Reference document.
---

# Toolchain Documenter Skill

This skill instructs the AI Agent on how to regenerate the `docs/toolchain-prompt/prompt.md` document, which outlines the current capabilities of the AI toolchain for cloning or reference purposes.

## When to use this skill
- When the user asks you to "regenerate the toolchain prompt", "update the toolchain documentation", or "produce a new version of the toolchain prompt".
- After significant new skills, workflows, or MCP servers have been added to the repository, to keep the documentation up-to-date.

## Instructions

1. **Analyze Current Capabilities:**
   - Use the `list_dir` tool to enumerate all folders inside `.agents/skills/`.
   - Use the `list_dir` tool to enumerate all markdown files inside `.agents/workflows/`.
   - Use the `view_file` tool to read the `SKILL.md` of any newly added or unfamiliar skills to understand their purpose.
   - Check the agent's system prompt or context for the currently available MCP servers (e.g., `wot-box-tester`, `infrastructure-analyzer-mcp`, `ast-analyzer-mcp`).

2. **Draft the Updated Document:**
   - Synthesize the gathered information into a structured, comprehensive markdown file.
   - The document **MUST** be entirely tech-stack agnostic. Do not focus on functional or stack components specific to this project (e.g., Next.js, React, Tailwind, Prisma, PostgreSQL).
   - Only document generic capabilities like "Relational Database" or "Validation Layer".
   - Include *strictly* the agentic toolchain (self-healing, MCP synchronization, autonomous testing, memory tracking, codebase workflows).
   - Exclude any skills or scripts that are highly specific to the business logic of this repository (e.g., do NOT document the `test-image-downloader` skill, as that is unique to this app's domain).
   - Group the capabilities logically (e.g., "1. Diagnostics & Healing", "2. MCP Optimizations", "3. Testing", etc.) and highlight how they maximize developer velocity.

3. **Save the File:**
   - Use the code editing tools (e.g. `write_to_file` with Overwrite or `replace_file_content`) to update the contents of `docs/toolchain-prompt/prompt.md` with the newly synthesized markdown.
   - Ensure the new file is formatted cleanly and professionally.

4. **Report to User:**
   - Summarize the newly added or removed capabilities that were incorporated into the updated prompt.


> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.
