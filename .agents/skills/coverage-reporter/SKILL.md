---
name: Coverage Reporter
description: Generates a comprehensive test coverage report for all parts of the application and toolchain, publishing the reports into the log folder.
---

# Coverage Reporter Skill

This skill should be used when the user requests to generate a comprehensive test coverage report for the application, or when they want to visualize test metrics across all parts of the project and toolchain.

## When to use
- The user asks for a test coverage report.
- The user wants to see test coverage metrics.
- The user wants to generate reports for the test suites.

## Instructions
1. First, inform the user that you are generating the comprehensive test coverage suite. Explain that this process may take several minutes because it triggers all validation layers (Unit, Database, Security, End-to-End, and Toolchain Diagnostics).
2. Because this operation is resource-intensive, **do not execute it in the main IDE terminal**. Instead, you MUST spawn a background `1_qa` Sub-Agent to handle the load:
   ```bash
   npx tsx scripts/swarm/docker-worker.ts spawn <taskId> "main" "Run npm run test:coverage and report back when finished" ts "1_qa"
   ```
3. Wait for the Sub-Agent to fully complete its work and gracefully exit. The outputs will be published securely to the `logs/coverage/` directory:
   - **Unit Tests**: `logs/coverage/unit-coverage.txt` (and `logs/coverage/unit/` for jest lcov HTML/LCOV reports)
   - **Database Tests**: `logs/coverage/db-coverage.txt`
   - **Security Tests**: `logs/coverage/security-coverage.txt`
   - **Toolchain Doctor**: `logs/coverage/toolchain-coverage.txt`
4. Use the `view_file` tool to read the generated coverage `.txt` summary files in `logs/coverage/`.
5. Provide a concise summary of the test coverage to the user based on the generated reports. Be sure to highlight any failing layers, errors, or specific metrics.

## Important Notes
- Always inform the user before starting the test suite, as it can be time-consuming and resource-intensive.
- Do not run individual testing commands when assessing overall coverage; rely entirely on the `npm run test:coverage` pipeline which orchestrates the outputs correctly.


> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.
