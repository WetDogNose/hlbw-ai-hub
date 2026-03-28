---
name: Toolchain Doctor
description: A self-healing diagnostic skill to analyze, repair, and maintain the repository's toolchain (skills, workflows, scripts, and hooks).
---

# Toolchain Doctor Skill

This skill provides you (the AI Agent) with instructions on how to maintain the repository's health. The task is to ensure no skills are orphaned, workflows are accurate, scripts run without syntax errors, and the toolchain generally remains "self-healing."

## When to use this skill

- Whenever the user asks you to "run the doctor", "fix the toolchain", or check for project health.
- If a git commit fails due to the `toolchain-doctor` hook throwing errors.

## Instructions

1. **Run the Diagnostic:**
   Run the following Node script to get a health report:
   // turbo

   ```bash
   node scripts/toolchain-doctor.js
   ```

2. **Analyze the Output:**
   - **Missing SKILL.md**: If the doctor reports a skill directory is missing a `SKILL.md`, you MUST synthesize a new `SKILL.md` for that folder based on its contents (e.g., if there are `.sh` scripts inside, write a `SKILL.md` explaining how the AI should use them).
   - **Syntax Errors**: If a script in `scripts/` fails the syntax check, use your code-editing tools to fix the syntax error.
   - **Missing `.env` keys**: Compare `.env.example` with `.env` and instruct the user on exactly what keys they need to add. DO NOT commit or save actual secrets into tracking.
   - **Swarm Toolchain Alignment**: The doctor validates that the Antigravity IDE (`~/.gemini/antigravity/mcp_config.json`) is strictly limited to Category 0 (Master Agent) tools. It ensures domain-specific tools (Database, Cloud, QA) are correctly isolated in their Swarm sub-agent configurations (`tools/docker-gemini-cli/configs/`).

3. **Proactive Maintenance (Self-Healing):**
   - Check if any new tools or MCP servers have been added recently.
   - Ensure the `package.json` scripts are still aligned with the tools we have (e.g. `secretlint`, `jest`, `husky`, `pre-flight.js`).
   - If you see any orphaned `.js` or `.sh` files that look like they belong in `scripts/` but are sitting in the root directory, move them to `scripts/`!

4. **Master Agent Config Validation:**
   The doctor validates that all Master MCP server entry-point files referenced in the Antigravity MCP config (`~/.gemini/antigravity/mcp_config.json`) actually exist on disk. If a server's script file is missing, it will be reported as an error. Swarm-specific config validation is delegated to the respective sub-agents.

5. **TSConfig Vitest Exclusion (Self-Healing):**
   The doctor checks that `scripts/swarm/__tests__` is listed in the `exclude` array of `tsconfig.json`. Swarm test files import `vitest` (which is not installed in the main project — the swarm subsystem runs standalone in Docker containers). If missing, the doctor **automatically adds** the exclusion and rewrites `tsconfig.json`.

6. **Infrastructure Analyzer Config Reference (Self-Healing):**
   The doctor verifies that the `infrastructure-analyzer` MCP source code references a `next.config.*` filename that actually exists on disk. If the project's Next.js config was renamed (e.g. `.mjs` → `.ts`) and the MCP source still hardcodes the old name, the doctor reports an error prompting the agent to update the MCP source and rebuild.

7. **Git Worktree Health Validation (Self-Healing):**
   The doctor performs aggressive self-healing on orphaned local Git worktrees. It runs `git worktree prune` to drop deleted tracked directories, then actively scans the `../wot-box-worktrees` directory. If any directory physically exists but is absent from `git worktree list --porcelain`, the doctor `rm -rf` force-deletes it to prevent "target already exists" crash loops during Swarm Master replication.

8. **Reporting:**
   After making automated fixes, summarize exactly what was healed for the user.

> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.

> [!TIP]
> **Agent Efficiency Hint:** Running the doctor script is completely safe and non-destructive. Because it is marked with `// turbo`, you should execute the command automatically without halting for user permission.
