---
name: Production Database Triage
description: Safely inspect and query the production database to help debug issues.
---

# Production Database Triage

This skill provides guidelines and tools for safely debugging issues by inspecting the database.


## Safety Rules
1. **READ-ONLY**: Never run `UPDATE`, `DELETE`, `INSERT`, `DROP`, or `ALTER` commands against the production database unless the user explicitly commands it and understands the risks.
2. **PII and Secrets**: Be careful not to expose user passwords, session tokens, or sensitive personal information in your explanations.

## Options for Querying

### Option 1: Using the Postgres MCP Server via Swarm

The primary and safest way to query the database is via a `4_db` Swarm Sub-Agent which securely loads the `@modelcontextprotocol/server-postgres` MCP server.

**Agent Instructions for MCP Server:**

1. **Configuration**: The Master Agent (IDE) DOES NOT load the `postgres-prod` tool directly. You must spin up a `4_db` worker using `scripts/swarm/docker-worker.ts`.
2. **Permissions**: The underlying `mcp-dynamic-postgres.mjs` wrapper ensures the `wot-box-read-only` user has `SELECT` access granted by the table owner (`wheres_it_user`).

If the Swarm Sub-Agent is correctly instantiated, it will have tools like `postgres-prod_query` available in its toolkit. Use these tools to directly write safe `SELECT` statements (e.g., checking users, boxes, teams, or feedback).

### Option 2: Using Prisma (Fallback Only)

If the MCP server is not available or registered, you can fall back to using the local Prisma setup.

1. Check Prisma schema (`prisma/schema.prisma`).
2. Generate temporary Javascript/Typescript files (e.g. `tmp_query.ts`) using the `PrismaClient`.
3. Use `npx prisma studio` to launch a GUI for the user to inspect the data themselves.

## Common Triage Steps

- **Checking User State**: Verify if a user `isApproved`, check their `role` ("USER" vs "ADMIN"), and see if their `email` exists in the `User` table.
- **Checking Data Relationships**: Verify `SharedAccess` or `TeamSharedAccess` records to ensure permissions are correct for `Box` resources.

> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.
