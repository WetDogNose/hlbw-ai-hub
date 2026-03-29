# Agent Swarming V3: A2A Warm Pools & Context Isolation

> [!NOTE]
> **Architectural Context**
> This is a component-specific technical specification. For the unified master pipeline map and inter-component relationships, please refer to the [V3 Swarming Model Architecture Master Document](../v3-swarming-model-architecture.md).

## Overview

The `hlbw-ai-hub` Swarming architecture has evolved from a strictly ephemeral, container-per-task model (V2) to a persistent **Warm Pool** model leveraging the Google ADK and Agent-To-Agent (A2A) SDK (V3).

This architectural shift eliminates the high latency overhead of aggressive Docker daemon provisioning (spin-up and spin-down times). By leaving worker containers actively running across an internal network, the Orchestrator can seamlessly and instantaneously pass jobs to "warm" environments via structured A2A JSON-RPC payloads.

## Core Architectural Pillars

### 1. Persistent Warm Pools

Instead of `scripts/swarm/docker-worker.ts` issuing `docker run` for every individual task, the swarm initializes fixed-capacity sub-agent pools on `hlbw-network`.

- The Node.js Master Orchestrator delegates tasks via network requests (HTTP/WS) directly to these running containers using the A2A protocol format.

### 2. Dual Worker Archetypes

The architecture supports two distinct persistent container models:

1. **Straight Worker** (`hlbw-swarm-worker` / `hlbw-python-worker`): Minimal overhead. Focused on headless scripts and generic logic.
2. **Gemini CLI Worker** (`docker-gemini-cli`): "Fat" container. Runs Google's interactive `@google/gemini-cli` over a headless PTY interface.

Both archetypes run a continuous listener (e.g., A2A HTTP or WebSocket Server) instead of a one-shot execution script.

### 3. Context Leakage Prevention & Session State

A primary risk of persistent workers is cross-task context leakage. V3 introduces **Session Persistence Policies**:

- **Ephemeral Tasks (Default)**: The standard delegation assigns a unique `task_id`. Once the worker returns a success response, the worker's internal orchestrator actively invokes a `.clear_context()` subroutine (purging memory, clearing working directories, and resetting environment variables).
- **Persistent Sessions (Multi-Turn)**: The Master Agent can transmit an A2A payload with `session_persistence: true`. The worker preserves the context window, file handles, and session ID, allowing subsequent conversational or iterative coding exchanges. All generated `task_id` and `session_id` identifiers must exclusively utilize alphanumeric UUID formatting (e.g., UUIDv4) to prevent numerical hallucination or identity overlap within the Swarm AI models.

### 4. Local Hardware Acceleration Edge Routing

All worker nodes are injected with their respective category `mcp_config.json`, which centrally mounts the `ollama-mcp` (Local Hardware Acceleration subsystem).
Because the workers are persistent, they continuously maintain the ability to route "simple" inference tasks (formatting, quick log parsing) to the localized GPU cluster without incurring external token costs or cold-start penalties, augmenting their true parallel throughput.

---

## Technical Interface

**Previous Pattern (V2)**:
`npx tsx docker-worker.ts spawn <task_id> <worktree> "Execute XYZ"` -> `docker run ...` -> `exit 0`

**New Pattern (V3 A2A)**:

1. Subsystem Boot: `pool-manager.ts` ensures 8 active worker nodes are idling on `hlbw-network` (e.g., `http://worker-1:8765`).
2. Delegation:

```json
// Master -> Worker (Over A2A)
{
  "version": "1.0",
  "task_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "session_id": "e81d4da3-09fe-4b13-918d-639a06fd1964",
  "message": "Refactor User Service in /workspace",
  "context": {
    "persistence_mode": "ephemeral",
    "hardware_acceleration": "ollama-mcp"
  }
}
```
1. Worker execution locally within container.
2. Worker responds via A2A response stream.
3. If `persistence_mode == "ephemeral"`, the worker executes `purge()`.
