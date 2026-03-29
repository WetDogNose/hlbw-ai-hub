# Local Hardware Acceleration & Swarm Concurrency

> [!NOTE]
> **Architectural Context**
> This is a component-specific technical specification. For the unified master pipeline map and inter-component relationships, please refer to the [V3 Swarming Model Architecture Master Document](../v3-swarming-model-architecture.md).

## Overview

As the `hlbw-ai-hub`'s Hub-and-Spoke Swarm continues to scale, relying purely on cloud-based LLM APIs and sequential execution creates cost and performance bottlenecks. To resolve this, we introduced the **Local Hardware Acceleration** architecture. This suite of features transforms the host machine's idle compute resources (e.g., NVIDIA GPUs, multi-core CPUs, and RAM) into dedicated, highly concurrent infrastructure for the hybrid swarm.

By shifting routine computational loads locally via an embedded Model Context Protocol (MCP) proxy and fundamentally refactoring the orchestrator's concurrency model, the environment now dynamically sustains high-throughput parallel swarms.

## Architectural Design

The Hardware Acceleration suite operates on three core pillars:

### 1. Embedded GPU Model Inference (Ollama)

The environment automatically provisions a local inference engine using `ollama`. During bootstrapping (`scripts/bootstrap.mjs`), the system guarantees the installation of the binary and precaches several specialized models tailored for agentic tasks:

- **`qwen2.5-coder:7b`**: A fast, highly capable local model optimized for coding reasoning and sub-agent autonomy.
- **`llava:7b`**: A local vision-language model utilized for end-to-end UI integration testing.
- **`nomic-embed-text`**: A lightweight model for swift local RAG embedding generation.

### 2. The `ollama-mcp` Proxy Server

To bridge the isolated Swarm Sub-Agents (running inside ephemeral Docker containers) with the host's GPU process, we developed an MCP Server (`tools/docker-gemini-cli/mcps/ollama`).

This server acts as a structured API gateway operating over `host.docker.internal:11434`, exposing the following core tools:

- `ollama_generate`: Prompts the local GPU models for offline reasoning without network latency.
- `ollama_list_models`: Discovers available models pre-cached on the host.
- `ollama_embeddings`: Generates vector embeddings for memory processing wholly on the edge.

This MCP server is systematically injected into the configuration of **all 6 sub-agent taxonomic categories**, ensuring that every spawned worker node can natively tap into the local processing swarm.

### 3. Hyper-Parallel Concurrency & Safe-Locking

Simply having local GPU access is insufficient if the orchestration layer cannot saturatethose resources. The internal node deployment pipeline was rewritten for maximum concurrency:

- **Throttling Lifted**: `maxActiveWorkers` was increased to 24, and `maxActiveIsolation` (worktrees) increased to 40 in `scripts/swarm/policy.ts`. This encourages AI Master Agents to dispatch tasks via asynchronous batches (`Promise.all`) rather than sequencial operations.
- **Test Parallelization**: `package.json` test suites across the repository natively invoke `--maxWorkers=80%`, maximizing local CPU core saturation.

## Implementation Details

### Atomic State Management (`state-manager.ts`)

Handling 20+ asynchronous background agents actively reading and writing to a single `.agents/swarm/state.json` file created severe `JSON.parse` race conditions and file corruption.

To resolve this, the orchestrator implements **Atomic File Locking**:

- The `proper-lockfile` extension restricts file handling to strict, thread-safe read-modify-write blocks (`withStateLock`).
- Deadlock mitigation includes exponential retry backoff and jittered acquisition queues.

### Decoupled Watchdog Operations

The Swarm Watchdog (`scripts/swarm/watchdog.ts`) validates the health of the 24 concurrent containers. Previously, it seized the database lock while polling the Docker daemon or executing Git cleanups.
In the accelerated architecture, the Watchdog is decoupled:

1. It queries system metrics entirely in memory.
2. It acquires the restrictive `proper-lockfile` for the exact microsecond required to commit the transaction.
This structural shift prevents lock starvation across the sub-agents and enables flawless multi-agent saturation.

## Usage & Best Practices

When acting as the Master Orchestrator, aim to maximize these resources:

1. **Batch Delegation**: Identify independent features, test suites, or modular refactoring targets, and spawn 10-15 sub-agents *at once* using the worker scripts. Let the OS scheduler and GPU queue manage the load natively.
2. **Promote Local Delegation**: Instruct sub-agents to utilize the `ollama_generate` tool for secondary data normalization, code commenting, or log parsing instead of burning premium remote API credits.
3. **Capacity Constraints**: If the host machine encounters Docker Daemon constraints or GPU Out-Of-Memory (OOM) errors during maximum load, decrease the limits located in `scripts/swarm/policy.ts` to stabilize the deployment pipeline.
