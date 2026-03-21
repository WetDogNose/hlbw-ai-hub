# Agent Swarming V2 (True Parallel Execution)

## Overview

Wot-Box features a robust, local Agent Swarming architecture designed to fan out complex, multi-stage directives into true-parallel sub-agent execution contexts without requiring a heavy external web server.

## Core Capabilities

1. **Git Worktree Isolation (`scripts/swarm/manage-worktree.ts`)**
   Generates physical Git Worktrees for every task with full lifecycle management: `create`, `list`, `status`, `sync`, `merge`, and `remove`. Capacity-limited to 15 concurrent isolation units.

2. **Docker Worker Execution (`scripts/swarm/docker-worker.ts`)**
   Tasks are executed by spinning up ephemeral Docker containers containing the Wot-Box Worker image. Supports single and **batch spawning** (`spawnBatch`), plus `getWorkerLogs`, `waitForWorker`, and `stopWorker` APIs. Capacity-limited to 8 concurrent workers.

3. **State Management & Backlog (`scripts/swarm/state-manager.ts`)**
   Full backlog API: `addTask`, `listTasks`, `assignTask`, `completeTask`, `updateTaskStatus`. Full worker API: `addWorker`, `getWorkerStatus`, `getWorkerResult`, `updateWorkerStatus`, `listWorkers`. Includes task size limit enforcement (100,000 chars) and retention-based cleanup.

4. **Arbiter (`scripts/swarm/arbiter.ts`)**
   Resolves dependency graphs, ensuring blocked tasks wait for prerequisites. Sorts by `(priority asc, createdAt asc)`.

5. **Convenience Delegate API (`scripts/swarm/delegate.ts`)**
   Single-call orchestration: creates task → creates isolation → assigns worker → shares context to Neo4j → returns runnable instructions with relevant shared context. Eliminates manual chaining of 3+ CLI calls.

6. **Orphan Cleanup Watchdog (`scripts/swarm/watchdog.ts`)**
   - **Health summary**: Structured report of pending/active/stale tasks, worker count, and isolation count.
   - **Feed**: Auto-assigns pending tasks to available worker capacity.
   - **Stale requeue**: Timeout detection with stale count tracking and audit metadata.
   - **Retention cleanup**: Removes completed records older than 5 days.
   - **Shared memory sync**: Updates Neo4j with stale/requeue status.

7. **Provider Adapter Layer (`scripts/swarm/providers.ts`)**
   Standard `GenerationRequest`/`GenerationResponse` interface with a `GeminiAdapter`. Provider registry with `registerProvider`, `getProvider`, `listProviders`.

8. **Audit Logging (`scripts/swarm/audit.ts`)**
   Append-only JSONL audit trail (`.agents/swarm/audit.jsonl`) logging all task/worker/isolation transitions with timestamps, actor identity, and reason metadata.

9. **Policy Configuration (`scripts/swarm/policy.ts`)**
   Centralized capacity and operational limits: max workers (8), max isolation (15), task size limit (100k), worker timeout (30min), retention (5 days).

10. **OpenTelemetry Tracing (`scripts/swarm/tracing.ts`)**
    Full semantic OTEL instrumentation across all scripts. Jaeger auto-starts/stops with the AI agent session via `mcp-trace-server.mjs`.

11. **Shared Memory via Neo4j (`scripts/swarm/shared-memory.ts`)**
    Graph-based knowledge sharing across all swarm agents via the `neo4j-memory` MCP server (Docker). Entities, relations, and observations are stored in a persistent Neo4j database (`wot-box-neo4j-data` volume). Key APIs:
    - `shareTaskContext()` — stores task info when delegated
    - `shareDiscovery()` / `shareDecision()` — agents share findings and decisions
    - `getSharedContext()` — queries relevant memories before starting work
    - `markTaskComplete()` — updates shared memory when done
    - Neo4j auto-starts/stops alongside Jaeger when the AI agent session begins/ends.
    - Neo4j Browser UI: `http://localhost:7474`
    - **Real-Time Monitoring**: Observe memory transitions as they happen via `npm run monitor:memory`. [Read documentation](docs/features/swarm-memory-monitoring.md).

## Master Agent Workflow

When modifying or scaling the application using the swarm, the primary developer AI instance should adopt the persona defined in `.agents/workflows/master-agent-coordinator.md`. This instructs the AI to break down intent into granular tasks, register them into the local state database, and sequentially evaluate the arbiter to dispatch workers without blocking the primary chat window.
