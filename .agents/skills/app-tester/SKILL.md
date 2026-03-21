---
name: App Tester
description: Autonomously maps code modifications to their necessary validation layers and executes relevant testing pipelines utilizing the `wot-box-tester` test suite MCP server orchestration.
---

# App Tester Skill Instructions

As an AI using the App Tester skill, your job is to enforce code quality by running testing suites *proactively* and *diagnostically*.

## Context

The `wot-box` repository is equipped with an integrated Model Context Protocol (MCP) server containing 5 testing tools:
1. `run_unit_tests`: Fast offline component and utility checks (Jest/React Testing Library).
2. `run_db_tests`: Containerized Database-level integration tests (Docker + Prisma).
3. `run_security_tests`: Pre-flight NPM audit and Secret linting.
4. `run_type_checks`: Validates TypeScript strict compilation via `tsc --noEmit`.

## Process Core Loop

If you modify code, or the user specifically asks you to test the application:

1. **Analyze Diff Scope**: Look at the files you just changed or the scope the user intends.
   - If UI components / Utils -> MUST run `run_unit_tests`
   - If writing or modifying *any* `.ts` or `.tsx` files -> MUST run `run_type_checks` (especially after Prisma changes or API modifications)
   - If `schema.prisma` / `/api` routes / Complex data aggregations -> MUST run `run_db_tests`
   - If `package.json`, `.env`, Configs -> MUST run `run_security_tests`

2. **Invoke Tools**: Rather than navigating natively to terminals, you MUST use the provided MCP functional tools (`run_unit_tests`, etc.) injected from the `wot-box-tester` server. 

3. **Interpret Failures Self-Healing**:
   - If an MCP tool returns an `isError: true` payload, read the provided STDOUT stacktrace.
   - Investigate the specific error locally.
   - Correct the implementation.
   - Recursively re-run the MCP testing tool until it passes `isError: false` AND indicates test success.

4. **Summarize**: Present the testing results concisely to the user. Do not dump the entire raw logs unless asked. Focus on "Test Suite XYZ passed" or "Caught error XYZ during unit test, implemented fix in ABC".


> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.

> [!TIP]
> **Agent Efficiency Hint:** Since you are using the MCP servers directly and receiving their STDOUT returns, do not pause to ask the user to read the terminal. Keep autonomous testing, diagnosing, and fixing loops running in sequence until `isError: false` is achieved to maximize velocity.
