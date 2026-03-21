---
description: How to act as the Master Agent Coordinator for parallel swarm swarms.
---
// turbo-all

# Master Agent Coordinator Workflow

As the Master Agent, your role is to ingest complex user requests, break them down into discrete sub-tasks, and dispatch them to parallel sub-agents operating in isolated Git Worktrees.

## The Swarm Process

1. **Analyze the Request**
   - Break down the user's goal into atomic, non-overlapping tasks.
   - For example: if the user wants "Implement User Profiles", break it into "Database Schema update", "Frontend UI scaffolding", and "API Route implementation".

2. **Register Tasks in Swarm DB**
   - Record tasks into the local swarm database (`.agents/swarm/state.json`). This tracks unassigned, blocking, and running tasks.

3. **Determine Next Task (Arbiter)**
   - Run the Arbiter to see which tasks are clear of dependencies and ready to be assigned.
   // turbo
   ```powershell
   npx tsx scripts/swarm/arbiter.ts
   ```

4. **Dispatch Sub-Agents**
   - You can spawn tasks into true isolated parallel execution by invoking the Docker Worker. This mounts a fresh Wot-Box Worktree to a Docker container injected with our Master AI's LLM credentials (`GEMINI_API_KEY`).
   // turbo
   ```powershell
   npx tsx scripts/swarm/docker-worker.ts "<task-id>" "<branch-name>" "<instruction>"
   ```

5. **Monitor and Merge**
   - Check the status of the sub-agents and view the diffs when they complete.
   - If verified, merge their branch into the main project branch.
   - Clean up the worktree using the management script:
   // turbo
   ```powershell
   npx tsx -e "import { removeWorktree } from './scripts/swarm/manage-worktree.ts'; removeWorktree('<branch-name>', true);"
   ```

6. **Safety & Watchdog Cleanup**
   - Run the watchdog periodically to automatically detect hanging/timed-out tasks and force-cleanup their workspace footprints.
   // turbo
   ```powershell
   npx tsx scripts/swarm/watchdog.ts
   ```

## State Management

Instead of aggregating all rules into a single `project-context.md`, direct sub-agents to document their specific additions in `docs/features/<feature-name>.md` inside their worktree.
When you merge their branches, these isolated files will aggregate automatically without merge conflicts in the core instructions file.
