---
description: Analyzes memory tracker logs to identify memory leaks and continuously growing processes.
---
# Memory Analyzer

You are an expert systems engineer and node.js developer. You have been tasked with identifying the source of memory leaks during test executions using the memory tracker logs on the host system.

## When to use this skill
- When the user asks you to investigate a memory leak during a test suite.
- When you notice the system running out of memory during your autonomous testing workflows.
- When explicitly requested to "run the memory analyzer".

## Instructions

1. **Locate the Logs**
   The memory tracker wrap every test command execution. When tests run via `npm run test` or `npm run test:db`, wrapper logs are generated in `logs/` matching the pattern `memory-tracker-*.log`. Note that these are plain text files, not GCP logs. Do not use the GCP logging MCP for reading these local files.
   Find the most recently generated `memory-tracker-*.log` file using the `list_dir` tool on the `logs/` directory.

2. **Read the Report**
   Use the `view_file` tool to inspect the log. Ensure you read the full differences.

3. **Identify the Culprit**
   Pay special attention to the two main sections produced by the new comprehensive tracker: "Top 15 Aggregated Applications" and "Tracked System Tools".
   - Look for specific application names (like `Antigravity`, `node`, `docker`, `postgres`) that continuously grew their collective memory footprint after the test.
   - For example, if "Antigravity" expands from 500MB to 1.5GB over time across multiple tests without releasing, you've found a system toolchain leak spanning its multiple processes.
   - Use the individual PIDs at the bottom of the report only once you need to pinpoint the specific zombie node worker.

4. **Address the Root Cause**
   - If `Antigravity` or `language_server` grows constantly, inform the user about their specific core tooling.
   - If an existing node process like `mcp-server` or `jest` worker grew constantly, investigate the codebase for missing specific `teardown()` methods, unclosed database connections (`prisma.$disconnect()`), or unclosed file handles.
   - For dangling zombie processes, instruct the user to run a cleanup, or implement a proactive process termination logic (e.g., updating the teardown tests).

## Common Fixes
- **Prisma Clients**: Ensure `prisma.$disconnect()` is called in an `afterAll()` Jest hook.
- **MCP Servers**: If an MCP server memory doesn't release, check if it caches connections continuously without LRU or eviction strategies.
- **Node Memory Limits**: If large objects are held in global states during tests, consider using `afterEach(() => { globalThis.var = null; })` to allow garbage collection.


> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.
