# Swarm Memory Real-Time Monitoring

## Overview
The Swarm Memory Monitoring system provides real-time visibility into the Neo4j-based shared knowledge graph used by the Hub Swarm agents. It allows developers to observe how agents share task context, discoveries, and decisions during parallel execution.

## Components

### 1. CLI Live Monitor (`scripts/swarm/monitor-memory.mjs`)
A high-signal terminal application that tails the swarm's audit logs (`.agents/swarm/audit.jsonl`) and formats memory-specific events for visual inspection.

**Key Visual Cues:**
- `[CREATED]` (Green): New entities (Tasks, Workers, Discoveries, Decisions) added to the graph.
- `[LINKED]` (Blue): Relationships established between entities (e.g., `Worker --[ASSIGNED_TO]--> Task`).
- `[UPDATED]` (Yellow): New observations or facts added to an existing entity.
- `[REMOVED]` (Red): Entities deleted from the graph.

### 2. Audit Integration (`scripts/swarm/shared-memory.ts`)
The `shared-memory.ts` client is instrumented to log 100% of graph mutations to the central audit trail. This ensures that the monitor captures every change made by any agent in the swarm.

### 3. MCP Diagnostic Tool (`scripts/mcp-trace-server.mjs`)
The `gcp-trace-mcp` server includes a `get_memory_stats` tool that provides a high-level summary of the graph's health directly within the Gemini CLI.

**Usage:**
```bash
mcp_gcp-trace-mcp_get_memory_stats
```
**Returns:**
- Total Node Count
- Total Relationship Count
- Node Distribution by Label (Type)

### 4. Visual Graph Inspection (Neo4j Browser)
For deep-dive structural analysis, the Neo4j Browser remains the primary tool for visualizing the full graph.
- **URL:** `http://localhost:7474`
- **Bolt:** `bolt://localhost:7687`
- **Auth:** `neo4j / wotbox-swarm`

## Usage Guide

### Starting the Monitor
To start the real-time stream, run the following command in a dedicated terminal:
```bash
npm run monitor:memory
```

### Typical Workflow
1. Start the Gemini CLI session (which auto-starts the Neo4j container via the trace server).
2. Open a second terminal and run `npm run monitor:memory`.
3. Initiate a Swarm task (e.g., "Add a new feature across 5 files").
4. Watch the monitor terminal to see:
   - The Master Agent registering the task.
   - Workers being assigned.
   - Workers sharing "discoveries" or "decisions" as they progress.
   - The knowledge graph building in real-time.

## Technical Details
- **Log Format:** JSONL (JSON Lines) for efficient tailing.
- **Location:** `.agents/swarm/audit.jsonl`
- **Transport:** The monitor uses `fs.watch` for sub-millisecond latency when new entries are appended.
- **Persistence:** All memory events are persisted in the `wot-box-neo4j-data` Docker volume, while the audit log provides the temporal history.
