# Swarm Memory Real-Time Monitoring

> [!NOTE]
> **Architectural Context**
> This is a component-specific technical specification. For the unified master pipeline map and inter-component relationships, please refer to the [V3 Swarming Model Architecture Master Document](../v3-swarming-model-architecture.md).

## Overview

The Swarm Memory Monitoring system provides real-time visibility into the Neo4j-based shared knowledge graph used by the Hub Swarm agents. It allows developers to observe how agents share task context, discoveries, and decisions during parallel execution.

## Components

### 1. Web Monitor (`tools/ai-memory-fragment-monitor`)

A Dockerized Node.js web application that connects to Neo4j to render the swarm memory graph in real time via `vis-network`. It runs an Express server and a WebSocket Server.

**Key Visual Cues (Graph):**

- Blue Nodes: Tasks
- Green Nodes: Workers
- Purple Nodes: Discoveries
- Orange Nodes: Decisions
- Grey Nodes: General Context/Entities

**Real-time Feed:**
The Web UI features a scrolling activity feed displaying raw WebSocket events emitted natively by the running swarm agents.

### 2. Audit Integration (`scripts/swarm/audit.ts`)

The `audit.ts` logger is instrumented to broadcast 100% of graph mutations directly to the `ai-memory-fragment-monitor` via WebSockets. To ensure low legacy and prevent blocking worker threads, it caches the connection state every 2 minutes. If the monitor container is offline, the logger silently drops packets to ensure zero File I/O overhead.

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

To start the real-time stream and web visualizer, build and run the Docker container:

```bash
cd tools/ai-memory-fragment-monitor
npm install
npm start
```

Or run via Docker:

```bash
docker build -t ai-memory-fragment-monitor .
docker run -d -p 3000:3000 --network hlbw-network --name ai-memory-fragment-monitor ai-memory-fragment-monitor
```

Then visit `http://localhost:3000` in your browser.

### Typical Workflow

1. Start the Gemini CLI session (which auto-starts the Neo4j container via the trace server).
2. Spin up the `ai-memory-fragment-monitor` container.
3. Open a browser to `http://localhost:3000`.
4. Initiate a Swarm task (e.g., "Add a new feature across 5 files").
5. Watch the monitor terminal to see:
   - The knowledge graph building in real-time.
   - The scrolling feed displaying actions, relations, and entity creations.

## Technical Details

- **Transport:** Real-time WebSockets directly from the Hub and Spoke agents securely to the isolated UI container.
- **Persistence:** All memory events are persisted in the `hlbw-neo4j-data` Docker volume. The legacy `.jsonl` audit file has been retired to completely eliminate filesystem I/O bottlenecking during concurrent agent execution token loops.
