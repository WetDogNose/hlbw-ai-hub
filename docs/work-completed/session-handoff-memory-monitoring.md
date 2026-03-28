# Session Handoff: Swarm Memory Monitoring (Part 1)

## Status: IN PROGRESS 🚧
**Objective:** Enable real-time monitoring of Neo4j shared memory updates from both the Host and autonomous Swarm Workers.

## What's Working ✅
1.  **Monitor App (`scripts/swarm/monitor-memory.mjs`)**: High-signal terminal UI with polling, origin tagging, and heartbeat.
2.  **Worker Infrastructure**: 
    - `Dockerfile.worker` updated with all OTEL/MCP dependencies.
    - `docker-manager-mcp` supports `extraBinds` and custom networks.
    - Workers now join `hlbw-network` to reach Neo4j.
3.  **Audit Trail**: All graph mutations in `shared-memory.ts` now append to `.agents/swarm/audit.jsonl`.
4.  **Worktree Detection**: The monitor successfully identifies and polls audit logs in isolated `hlbw-worktrees`.

## The Remaining Mystery 🕵️
The monitor reports **"Monitoring 13 logs"**, but only displays events from the `[MAIN]` log. It is currently "silent" when autonomous sub-agents write to their local worktree audit logs, even though:
-   The logs physically exist in the worktrees (verified by `dir`).
-   The sub-agents report success in their internal logs.
-   The glob pattern correctly identifies the files.

## Hypotheses for Tomorrow 🧪
1.  **Path Normalization**: The `filePath` comparison in `processLine` might still be failing due to mixed slashes or absolute vs relative path mismatches.
2.  **Initial Size Tracking**: `updateAuditFiles` sets `lastSize` to the current file size on discovery. If the sub-agent writes its discovery *before* the monitor discovers the new worktree log, that event will be skipped.
3.  **Read Permissions**: While `fs.statSync` works, the subsequent `fs.readSync` might be failing silently or returning empty buffers for files in other worktrees.

## Next Steps for Part 2
1.  Run `scripts/swarm/monitor-memory.mjs` with debug logging enabled for every file discovery and read operation.
2.  Adjust `updateAuditFiles` to display the last 10 lines of *any* newly discovered log immediately to verify visibility.
3.  Verify the `originTag` parsing logic with a specific test case for Windows paths.

**Current Task ID for testing:** `task-1773922794045-391` (or latest in `state.json`)
