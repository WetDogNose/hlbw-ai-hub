---
name: Repo Cleaner
description: A utility to purge temporary files, old logs, and test outputs to maintain repository hygiene.
---

# Repo Cleaner Skill

This skill allows the AI Agent to maintain the health and footprint of the repository by clearing out stale artifacts generated during development, testing, and operation.

## When to use this skill
- When the user asks you to "clean the repo", "delete old logs", or "clear temporary files".
- In combination with or after running heavy test suites that generated output (such as Coverage Reporter or App Tester).

## Instructions

1. **Run the Cleaner:**
   To purge temporary files, clear old logs (keeps only the last 5), and delete test output folders (`coverage`), run the following script:
   ```bash
   node scripts/repo-cleaner.js
   ```

2. **Analysis:**
   The script will output exactly how many files and directories were deleted. Report this summary back to the user.

## Automatic Execution
Note that this script is also automatically wired into:
- `npm run dev` (via `scripts/pre-flight.js`) so that local environments start clean.
- `scripts/toolchain-doctor.js` so that periodic health checks also manage the repository footprint.


> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.
