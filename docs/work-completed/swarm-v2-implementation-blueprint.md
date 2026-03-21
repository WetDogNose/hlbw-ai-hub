# Agent Swarm V2 Implementation Blueprint (Observability, Memory & Full Lifecycle)

## Purpose

This document gives another agent enough detail to recreate the same swarm outcomes on a different toolchain, without requiring the original codebase, specific MCP servers, or any proprietary vendor lock-in. It extends the original Swarm Replication Blueprint with concrete implementation details for the observability, shared memory, conflict resolution, and lifecycle management layers that were built on top of the coordination and execution planes.

Target outcomes to replicate:

1. Parallel multi-task execution with coordination and dependency-aware scheduling.
2. Safe isolation of code changes per task via Git worktrees with full lifecycle management.
3. Backlog-driven orchestration with priorities, dependencies, capacity enforcement, and retention policies.
4. Health monitoring, stale-work rebalancing, auto-feed, and cleanup automation.
5. True parallel Docker workers with isolated runtime context and batch spawning.
6. Distributed tracing via OpenTelemetry with automatic infrastructure lifecycle management.
7. Shared memory across all agents via a Neo4j graph database knowledge store.
8. Interactive merge conflict resolution with configurable strategies.
9. Provider-agnostic model invocation with contract-tested adapters.
10. Append-only audit logging with actor identity and reason metadata.
11. Security and governance guardrails suitable for regulated environments.

## Read This First (No-Repo Reimplementation)

If the implementing agent has zero access to this repository, this blueprint is still sufficient if followed in order:

1. Build the **coordination plane** first (queue + isolation + arbiter + watchdog).
2. Add the **worker plane** second (spawn/status/result/wait/cleanup).
3. Integrate an **LLM provider adapter layer** (not provider-specific logic in core).
4. Add the **observability plane** (OpenTelemetry tracing + local trace viewer).
5. Add the **shared memory plane** (graph database knowledge store).
6. Add the **conflict resolution plane** (interactive merge strategies).
7. Add diagnostics, permission controls, and audit logging last.
8. Wire all planes into a **unified lifecycle** that auto-starts/stops infrastructure.

Do not start with provider SDK wiring; start with orchestration state machines and contracts.

---

## What This Toolchain Actually Implements

The current implementation uses five orchestration planes:

1. **Coordination plane** (swarm orchestrator):
   - Work isolation lifecycle (create/list/status/sync/merge/remove)
   - Backlog lifecycle (add/list/assign/update/complete)
   - Arbitration (next task, conflict handling, stale rebalance)
   - Watchdog (health, feed, cleanup)
   - Convenience delegation API (one-call backlog + isolation + assignment)

2. **Execution plane** (Docker workers):
   - Spawn isolated workers for long or heavy tasks
   - Batch spawn for true concurrency
   - Status/result/logs/wait/stop/cleanup lifecycle
   - Mount of isolated task workspace via Git worktree volumes

3. **Observability plane** (OpenTelemetry + Jaeger):
   - Full semantic OTEL instrumentation across all scripts
   - OTLP HTTP export to local Jaeger instance
   - Automatic Jaeger container lifecycle (start on AI session open, stop on exit)
   - Span-level detail for every operation: delegation, isolation, worker spawn, merge, memory

4. **Shared memory plane** (Neo4j knowledge graph):
   - Graph-based knowledge sharing across all swarm agents
   - Task context persistence, discovery sharing, decision recording
   - Full-text search for relevant prior context before starting work
   - Automatic Neo4j container lifecycle (start/stop with AI session)
   - Persistent Docker volume for data survival across restarts

5. **Governance plane** (policy + audit + security):
   - Centralized policy configuration for all capacity and operational limits
   - Append-only JSONL audit trail for all state transitions
   - Input validation with strict branch identifier allowlists
   - Provider-neutral credential handling via environment injection

Core repo-level enablers around those planes:

- MCP server registration and discovery (`.gemini/mcp.json`)
- Docker Manager MCP for container lifecycle control
- GCP Trace MCP for production trace access
- Session hooks for infrastructure auto-start/stop
- Diagnostics and self-healing checks via Toolchain Doctor skill

---

## Capability Contract (Must-Haves)

Recreate these capabilities first; implementation details may vary:

### A. Isolation Contract

- Every non-trivial task runs in an isolated Git worktree.
- Isolation identity is stable (`branch_name` derived from `task_id`).
- Isolated work can be listed, status-checked, synced, merged, or discarded independently.
- Merge supports configurable conflict resolution strategies.
- Capacity is enforced: maximum concurrent isolation units are configurable.

Required APIs:

| Operation | Description |
|---|---|
| `create(branchName)` | Create a new Git worktree with a dedicated branch. Validates name against regex allowlist. Checks capacity before creation. |
| `list()` | Parse `git worktree list --porcelain` and return all managed worktrees with branch, path, head, and status (active/prunable). |
| `status(branchName)` | Return ahead/behind relative to main, count of changed files, and conflict detection. |
| `sync(branchName)` | Fetch origin and rebase onto origin/main. Report conflicts if rebase fails. |
| `merge(branchName, strategy)` | Merge branch into mainline using specified conflict resolution strategy. Auto-resolve per-file conflicts. Audit-log all outcomes. |
| `remove(branchName, force?)` | Remove worktree. Optionally force-delete the branch. |

### B. Backlog Contract

- Task states: `pending`, `in_progress`, `blocked`, `completed`, `failed`, `cancelled`.
- Priority queue (1 highest to 5 lowest).
- Dependency support (`task B` blocked until `task A` is completed).
- Assignment metadata (`assigned_agent`, timestamps, metadata map).
- Task size limit enforcement (configurable maximum description character count).
- Retention cleanup (remove completed records after configurable days).

Required APIs:

| Operation | Description |
|---|---|
| `addTask(task)` | Create a new task with validation. Enforce character limits. Audit-log the creation. |
| `listTasks(filter?)` | List tasks with optional status filter. |
| `assignTask(taskId, agentId)` | Set agent assignment, transition to `in_progress`, record start timestamp. Audit-log. |
| `completeTask(taskId, result?)` | Transition to `completed`, store result in metadata, record completion timestamp. Audit-log. |
| `updateTaskStatus(id, status, actor)` | Generic status transition with automatic timestamp management. Audit-log with actor identity. |
| `getPendingTasks()` | Retrieve all tasks in `pending` state. |
| `cleanupRetention()` | Remove completed tasks/workers older than retention period. Enforce max worker record count. |

### C. Arbitration Contract

- Determine next executable task by: status, dependency resolution, priority, age.
- Detect stale tasks by inactivity threshold.
- Requeue stale tasks safely with audit metadata.
- Track stale count per task for escalation visibility.
- Record previous assignment (agent) and stale timestamp on each requeue.

### D. Watchdog Contract

- Health summary across queue + isolation resources + worker capacity.
- Auto-feed: assign pending tasks into available capacity up to the concurrent worker limit.
- Stale requeue: detect workers exceeding timeout, stop containers, cleanup worktrees, requeue the task.
- Stale metadata: increment `metadata.staleCount`, record `lastStaleAgent` and `lastStaleAt`.
- Retention cleanup: invoke `cleanupRetention()` on every watchdog cycle.
- Shared memory sync: update Neo4j with stale/requeue status when a task is requeued.

### E. Worker Contract

- Spawn individual worker jobs with task payload into isolated Docker containers.
- Spawn batch jobs in parallel using `Promise.allSettled` for fault-tolerant concurrency.
- Poll status, collect result, stream logs, wait for completion, force stop.
- Enforce concurrency limit, task size limit, and timeout.
- Track `runtimeId` (container ID) on the worker record.

Required APIs:

| Operation | Description |
|---|---|
| `spawnDockerWorker(taskId, instruction, branch)` | Create worktree + register worker + start Docker container + update status to Running. |
| `spawnBatch(requests[])` | Spawn multiple workers in parallel. Return per-item success/error. Audit-log batch metrics. |
| `getWorkerLogs(containerId)` | Retrieve container stdout/stderr via Docker MCP. |
| `waitForWorker(containerId, pollMs?, timeoutMs?)` | Poll container status until exit or timeout. |
| `stopWorker(containerId)` | Force-stop a running container via Docker MCP. |
| `getWorkerStatus(workerId)` | Read worker record from state. |
| `getWorkerResult(workerId)` | Return result/error fields from worker record. |

### F. Observability Contract

- Every public function in the swarm is wrapped in an OTEL span via `tracer.startActiveSpan`.
- Spans include typed attributes (task.id, branch.name, worker.id, container.id, etc.).
- Exceptions are recorded on spans via `span.recordException(err)`.
- Traces are exported to a local OTLP HTTP endpoint (`http://localhost:4318/v1/traces`).
- A local Jaeger container is auto-started when the AI agent session begins.
- The Jaeger container is auto-stopped when the AI agent session ends (via stdin close or SIGTERM).
- Jaeger UI is accessible at `http://localhost:16686`.
- Service name is `agent-swarm` with version `1.0.0`.

### G. Shared Memory Contract

- All agents share a persistent Neo4j graph database for cross-agent knowledge.
- The Neo4j container is auto-started/stopped alongside Jaeger.
- Data persists across restarts via a named Docker volume (`swarm-neo4j-data`).
- The memory client connects to Neo4j via the `neo4j-memory` MCP Docker image.

Required APIs:

| Operation | Description |
|---|---|
| `storeEntity(name, type, observations[])` | Create or merge an entity into the knowledge graph. Types: `swarm_task`, `swarm_worker`, `swarm_discovery`, `swarm_decision`, `swarm_context`. |
| `addObservations(entityName, observations[])` | Append facts to an existing entity. |
| `createRelation(source, target, relationType)` | Create a directed edge between two entities. |
| `searchMemory(query)` | Full-text search across entity names, types, and observations. Returns matching subgraph. |
| `findByName(names[])` | Exact-match lookup of entities plus their relationships. |
| `readGraph()` | Retrieve the entire knowledge graph. |
| `removeEntity(name)` | Delete an entity and all its relationships. |
| `shareTaskContext(taskId, title, desc, branch)` | Convenience: store a swarm_task entity when a task is delegated. |
| `shareDiscovery(workerId, taskId, discovery)` | Convenience: store a finding linked to its originating task. |
| `shareDecision(taskId, decision, rationale)` | Convenience: store a decision linked to a task. |
| `getSharedContext(taskTitle)` | Convenience: search for relevant prior context before starting work. Returns formatted observation strings. |
| `markTaskComplete(taskId, summary)` | Convenience: update shared memory with completion status and summary. |

### H. Merge Conflict Resolution Contract

- Merge operations accept a configurable strategy parameter.
- Four strategies are supported:

| Strategy | Behavior |
|---|---|
| `theirs` | Accept the incoming branch's version for all conflicting files. Default for swarm — workers produce the authoritative output. |
| `ours` | Keep the current mainline branch's version for all conflicting files. |
| `union` | Strip conflict markers and keep both sides. Best for additive files like docs, configs, and changelogs. |
| `manual` | Detect and report conflicts but do not auto-resolve. Leave markers in place for human resolution. |

- Per-file resolution: each conflicted file is resolved individually.
- Merge result includes per-file status (resolved/unresolved), strategy used, and overall success.
- All outcomes are audit-logged with conflict file lists and strategy metadata.
- Partial resolution: if some files resolve but others don't, the partial result is reported.

### I. Audit Contract

- All state transitions are logged to an append-only JSONL file (`.agents/swarm/audit.jsonl`).
- Every log entry includes:
  - `timestamp` (ISO 8601)
  - `actor` (e.g., "master-agent", "watchdog", "delegate", "isolation", "shared-memory")
  - `action` (e.g., "task.created", "worker.timeout", "isolation.merge_auto_resolved")
  - `entityType` (e.g., "task", "worker", "isolation", "state", "entity")
  - `entityId` (specific identifier)
  - `previousState` (optional)
  - `newState` (optional)
  - `reason` (optional human-readable explanation)
  - `metadata` (optional structured data)

### J. Provider Adapter Contract

- Core orchestrator never branches on provider names. It only calls the generic adapter interface.
- Provider registry supports runtime registration of new adapters.

Required interface:

| Method | Signature | Description |
|---|---|---|
| `generate` | `(request: GenerationRequest) → Promise<GenerationResponse>` | Execute a model invocation. Request includes system prompt, user prompt, model ID, max tokens, temperature, timeout. Response includes text, provider name, model ID, finish reason, token counts. |
| `healthcheck` | `() → Promise<boolean>` | Verify the provider is operational (credentials present, endpoint reachable). |

Registry APIs:

| Operation | Description |
|---|---|
| `registerProvider(adapter)` | Add an adapter to the registry. |
| `getProvider(name)` | Retrieve an adapter by name. Throws if unknown. |
| `listProviders()` | List all registered provider names. |

### K. Provider Contract Tests

Every adapter implementation must pass these 12 contract assertions:

1. `adapter.name` is a non-empty string.
2. `generate()` returns a `GenerationResponse` with non-empty `text`.
3. `response.provider` is a string matching `adapter.name`.
4. `response.modelId` is a non-empty string.
5. `response.modelId` matches the requested `modelId` (passthrough verification).
6. Optional fields (`finishReason`, `inputTokens`, `outputTokens`, `totalTokens`) have correct types when present.
7. `healthcheck()` returns a boolean.
8. `healthcheck()` is idempotent (two consecutive calls return the same value).
9. `generate()` handles empty prompts gracefully (returns or throws clean error).
10. Registry auto-registers built-in adapters.
11. `getProvider()` throws for unknown provider names.
12. `registerProvider()` + `getProvider()` round-trip succeeds for dynamically registered adapters.

---

## Reference Architecture (Portable)

Implement these logical components (as services, libraries, or scripts):

1. **Orchestrator API**
   - Exposes coordination tools/endpoints.
   - Owns queue and isolation state machine.
   - Provides the `delegate()` convenience call.

2. **Worker Runtime Manager**
   - Starts/stops isolated Docker workers via MCP or CLI.
   - Enforces resource/time limits via policy configuration.
   - Captures logs and results.
   - Supports single and batch spawning.

3. **State Store**
   - Persists backlog, isolation records, worker records.
   - JSON file-based storage under `.agents/swarm/state.json`.
   - Full read/write locking through atomic file operations.

4. **Isolation Manager**
   - Creates/removes/syncs/merges isolated Git worktrees.
   - Enforces capacity limits from centralized policy.
   - Interactive conflict resolution with strategy selection.

5. **Observability Layer**
   - OpenTelemetry SDK initialization (`startTracing()` / `stopTracing()`).
   - OTLP HTTP exporter to local Jaeger.
   - Named tracer (`swarm-tracer`) with service attributes.
   - Auto-lifecycle Docker container management for Jaeger.

6. **Shared Memory Layer**
   - Neo4j graph database via `neo4j-memory` MCP Docker image.
   - Client abstraction over MCP tool calls.
   - Swarm-specific convenience functions for task/discovery/decision sharing.
   - Auto-lifecycle Docker container management for Neo4j with persistent volume.

7. **Policy Layer**
   - Centralized configuration object (`SWARM_POLICY`).
   - Enforced at point-of-use (not deferred).
   - Controls: max workers, max isolation, task size, timeout, retention, max records.

8. **Audit Layer**
   - Append-only JSONL file.
   - Actor-attributable transitions.
   - CLI reader for recent entries.

9. **Diagnostics + Self-Healing**
   - Environment checks, auth checks, dependency checks.
   - Toolchain Doctor skill for repair automation.
   - Health summary output on every watchdog cycle.

10. **Agent UX Layer**
    - MCP server registration and discovery.
    - Master Agent workflow documentation.
    - Global AI hints in all skill and workflow files.
    - `/master-agent-coordinator` slash command workflow.

---

## Data Model Blueprint

### Task Record

```typescript
interface Task {
  id: string;                              // e.g. "task-1710000000000-42"
  title: string;                           // short summary
  description: string;                     // full instruction payload (max 100,000 chars)
  priority: number;                        // 1 (highest) to 5 (lowest)
  status: TaskStatus;                      // enum: pending | in_progress | blocked | completed | failed | cancelled
  dependencies: string[];                  // task IDs that must complete first
  blockedBy: string[];                     // computed: tasks currently blocking this one
  assignedAgent?: string;                  // agent/worker type assigned
  isolationId?: string;                    // branch name for the isolation worktree
  createdAt: string;                       // ISO 8601 timestamp
  startedAt?: string;                      // set when transitioned to in_progress
  completedAt?: string;                    // set when transitioned to completed/failed/cancelled
  metadata: Record<string, unknown>;       // extensible: staleCount, lastStaleAgent, lastStaleAt, result, agentType
}
```

### Worker Record

```typescript
interface Worker {
  id: string;                              // e.g. "worker-1710000000000-42"
  taskId: string;                          // associated task
  provider: string;                        // e.g. "gemini"
  modelId: string;                         // e.g. "gemini-2.5-flash"
  status: WorkerStatus;                    // enum: pending | starting | running | completed | failed | timeout | cancelled
  runtimeId?: string;                      // Docker container ID
  result?: string;                         // worker output text
  error?: string;                         // error message if failed
  createdAt: string;                       // ISO 8601
  startedAt?: string;                      // set when container starts
  completedAt?: string;                    // set on terminal transition
  metadata: Record<string, unknown>;       // extensible: containerId, branchName, instructionPayload, agentType
}
```

### Isolation Record (Worktree)

```typescript
interface WorktreeInfo {
  branch: string;                          // branch name
  path: string;                            // absolute filesystem path
  head: string;                            // HEAD commit hash
  status: "active" | "prunable";           // current lifecycle state
}

interface WorktreeStatus {
  branch: string;                          // branch name
  ahead: number;                           // commits ahead of main
  behind: number;                          // commits behind main
  filesChanged: number;                    // files different from main
  hasConflicts: boolean;                   // true if UU/AA/DD markers present
}
```

### Merge Result

```typescript
interface MergeConflict {
  file: string;                            // relative file path
  status: "resolved" | "unresolved";       // outcome
  strategy?: string;                       // resolution strategy used
}

interface MergeResult {
  success: boolean;                        // true if merge committed
  conflicts: boolean;                      // true if conflicts were detected
  conflictFiles: MergeConflict[];          // per-file detail
  strategy: string;                        // strategy applied
}

type MergeStrategy = "theirs" | "ours" | "union" | "manual";
```

### Audit Entry

```typescript
interface AuditEntry {
  timestamp: string;                       // ISO 8601
  actor: string;                           // who triggered: master-agent, watchdog, delegate, isolation, shared-memory, system, cleanup
  action: string;                          // what happened: task.created, worker.timeout, isolation.merge_auto_resolved, etc.
  entityType: string;                      // what kind: task, worker, isolation, state, entity
  entityId: string;                        // specific identifier
  previousState?: string;                  // state before transition
  newState?: string;                       // state after transition
  reason?: string;                         // human-readable explanation
  metadata?: Record<string, unknown>;      // structured supplementary data
}
```

### Provider Contracts

```typescript
interface GenerationRequest {
  systemPrompt: string;
  userPrompt: string;
  modelId: string;
  maxTokens?: number;
  temperature?: number;
  timeoutSeconds?: number;
  metadata?: Record<string, unknown>;
}

interface GenerationResponse {
  text: string;
  provider: string;
  modelId: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  raw?: unknown;
}

interface LLMProviderAdapter {
  readonly name: string;
  generate(request: GenerationRequest): Promise<GenerationResponse>;
  healthcheck(): Promise<boolean>;
}
```

### Neo4j Shared Memory Entities

```
Entity types:
  swarm_task       — task context shared for cross-agent visibility
  swarm_worker     — worker registration and status
  swarm_discovery  — something an agent found during execution
  swarm_decision   — a design decision affecting multiple tasks
  swarm_context    — general shared context

Relation types:
  DISCOVERED_DURING  — links a discovery to its originating task
  DECIDED_FOR        — links a decision to the task it applies to
  DEPENDS_ON         — task dependency (optional graph representation)
```

### Policy Configuration

```typescript
const SWARM_POLICY = {
  maxActiveWorkers: 8,                     // max concurrent Docker workers
  maxActiveIsolation: 15,                  // max concurrent Git worktrees
  maxTaskChars: 100_000,                   // max description size
  workerTimeoutMinutes: 30,               // before watchdog marks stale
  retentionDays: 5,                        // completed record cleanup
  maxRetainedWorkerRecords: 100,           // max historic worker entries
  defaultProvider: "gemini",               // provider for new workers
  defaultModel: "gemini-2.5-flash",        // model for new workers
};
```

---

## API/Tool Surface to Recreate

Map these capabilities into your own API names:

### Isolation

- `create(branchName) → worktreePath`
- `list() → WorktreeInfo[]`
- `status(branchName) → WorktreeStatus`
- `sync(branchName) → void`
- `merge(branchName, strategy?) → MergeResult`
- `remove(branchName, force?) → void`

### Backlog

- `addTask(task) → Task`
- `listTasks(filter?) → Task[]`
- `assignTask(taskId, agentId) → Task`
- `completeTask(taskId, result?) → Task`
- `updateTaskStatus(id, status, actor) → Task`
- `getPendingTasks() → Task[]`
- `cleanupRetention() → { removedTasks, removedWorkers }`

### Arbiter

- `getNextAvailableTask() → Task | null`

### Watchdog

- `runWatchdog() → void` (runs health, feed, stale requeue, retention cleanup, shared memory sync, and health summary in sequence)

### Swarm Convenience

- `delegate(request) → DelegateResult`
  - Creates task
  - Creates isolation
  - Assigns worker
  - Shares context to Neo4j
  - Queries relevant shared context
  - Returns runnable instructions + shared context

### Worker Runtime

- `spawnDockerWorker(taskId, instruction, branch)`
- `spawnBatch(requests[])`
- `getWorkerLogs(containerId)`
- `waitForWorker(containerId, pollMs?, timeoutMs?)`
- `stopWorker(containerId)`
- `getWorkerStatus(workerId) → Worker`
- `getWorkerResult(workerId) → { result, error }`

### Shared Memory

- `storeEntity(name, type, observations[])`
- `addObservations(entityName, observations[])`
- `createRelation(source, target, relationType)`
- `searchMemory(query) → KnowledgeGraph`
- `findByName(names[]) → KnowledgeGraph`
- `readGraph() → KnowledgeGraph`
- `removeEntity(name)`
- `shareTaskContext(taskId, title, desc, branch)`
- `shareDiscovery(workerId, taskId, discovery)`
- `shareDecision(taskId, decision, rationale)`
- `getSharedContext(taskTitle) → string[]`
- `markTaskComplete(taskId, summary)`

### Provider Management

- `registerProvider(adapter)`
- `getProvider(name) → LLMProviderAdapter`
- `listProviders() → string[]`

### Audit

- `appendAudit(entry) → void`
- `readAuditLog(limit?) → AuditEntry[]`

### Observability

- `startTracing() → void`
- `stopTracing() → void`
- `getTracer(name?) → Tracer`

---

## Scheduling and Decision Policies

Implement these explicit policies (don't leave implicit):

1. **Delegation policy**
   - Trivial/single-line tasks: direct execution in primary context.
   - Medium tasks: task agents with shared context via Neo4j.
   - Heavy independent tasks: isolated parallel Docker workers.

2. **Queue selection policy**
   - Eligible = `pending` and dependencies completed.
   - Sort by `(priority asc, created_at asc)`.

3. **Capacity policy**
   - Max active isolation units: 15.
   - Max active workers: 8.
   - Max task description size: 100,000 characters.

4. **Staleness policy**
   - If `in_progress` and no activity > 30 minutes, return to `pending`.
   - Increment `metadata.staleCount` and track previous assignment (`lastStaleAgent`, `lastStaleAt`).
   - Update shared memory with stale status.
   - Stop the stale worker's Docker container.
   - Cleanup the stale worker's worktree.

5. **Cleanup policy**
   - Remove completed tasks/workers after 5 days.
   - Remove merged/abandoned isolation units.
   - Keep maximum 100 recent worker records.
   - Run retention cleanup on every watchdog cycle.

6. **Merge conflict policy**
   - Default strategy: `theirs` (worker output is authoritative).
   - Override per-merge for special cases (docs → `union`, contested → `manual`).
   - Auto-resolve per-file, commit if all resolved, report partial if not.

7. **Shared memory policy**
   - Store task context in Neo4j on every delegation.
   - Query shared context before starting work (passed to delegate result).
   - Update shared memory on stale requeue.
   - Mark task complete in shared memory on completion.

---

## Security and Governance Requirements

These are non-negotiable if you want comparable reliability:

1. **Input validation**
   - Validate branch/workspace identifiers with strict regex: `/^[a-zA-Z0-9-_]+$/`.
   - Enforce max task description length (100,000 chars).
   - Reject traversal/meta characters in all identifiers.

2. **Command execution hardening**
   - Use `stdio: "pipe"` instead of `stdio: "inherit"` for merge operations to capture output.
   - Set command timeouts via watchdog policy.
   - Capture stdout/stderr and return structured errors.

3. **Credential handling**
   - Inject `GEMINI_API_KEY` into Docker workers via environment variables.
   - Neo4j authentication via environment variables (not hardcoded in scripts).
   - Never log secrets.
   - Mount only required credentials per worker.

4. **Transport safety**
   - MCP servers reserve stdout for protocol and send logs to stderr.
   - Docker containers use stdio transport for MCP communication.

5. **Auditability**
   - Persist all task/worker/isolation/memory transitions.
   - Include timestamps, actor identity, and reason metadata.
   - Append-only format prevents tampering.

6. **Infrastructure lifecycle safety**
   - Auto-stop all managed Docker containers on session exit.
   - Catch SIGINT, SIGTERM, and stdin close events.
   - Use Docker named volumes for data persistence.
   - Attempt container restart before fresh creation.

---

## Operations Playbook

### Session bootstrap

1. MCP trace server starts → auto-starts Jaeger container.
2. MCP trace server starts → auto-starts Neo4j container.
3. Agent loads workspace/system context.
4. Agent validates server/tool registrations.

### Continuous operations loop

1. `runWatchdog()` → health check for stale workers.
2. `feedPendingTasks()` → auto-assign pending tasks to available capacity.
3. Monitor + rebalance stale work.
4. `cleanupRetention()` → remove old completed records.
5. Merge/complete finished tasks.
6. Health summary output to console.

### Failure recovery

- **Merge conflict path**: detect → identify per-file conflicts → apply strategy → resolve or report partial → audit-log outcome.
- **Worker timeout path**: detect via watchdog → stop container → cleanup worktree → increment stale count → requeue task → update shared memory.
- **Capacity exhaustion**: cleanup completed resources before adding new work. Check capacity in `addWorker()` and `createWorktree()`.
- **Neo4j unavailable**: all shared memory operations are try/catch wrapped and non-fatal. Swarm continues without memory.
- **Jaeger unavailable**: tracing continues but spans are dropped. Non-fatal.

### Session shutdown

1. SIGINT/SIGTERM/stdin-close detected.
2. `docker stop swarm-jaeger` (ignore errors).
3. `docker stop swarm-neo4j` (ignore errors).
4. Process exits.

---

## Testing Strategy (Replicate This)

1. **Provider adapter contract tests** (28 assertions)
   - Name, generate response shape, provider passthrough, modelId passthrough.
   - Optional field types, healthcheck boolean + idempotency.
   - Empty prompt handling, registry round-trips, unknown provider rejection.
   - Mock adapter passes identical contract suite.

2. **Unit tests for state machines**
   - Task transitions and dependency behavior.
   - Arbiter selection and stale rebalance.

3. **Unit tests for isolation validation**
   - Valid and invalid identifiers.
   - Capacity limit enforcement.
   - Merge conflict detection and resolution.

4. **Worker orchestration tests (mock runtime)**
   - Spawn limits, timeout handling, result parsing, cleanup.
   - Batch spawn with partial failures.

5. **Shared memory tests**
   - Entity CRUD operations via MCP client.
   - Relation creation and search.
   - Non-fatal failure when Neo4j is unavailable.

6. **Audit tests**
   - JSONL append and read round-trip.
   - Entry structure validation.

7. **Diagnostics tests**
   - Environment missing cases produce actionable remediation messages.

---

## From-Scratch Implementation Scaffold

Use this baseline layout in any TypeScript stack:

```text
scripts/swarm/
   types.ts                     # Enums and interfaces (Task, Worker, SwarmState)
   policy.ts                    # Centralized capacity/retention/timeout configuration
   state-manager.ts             # Persistent JSON state: full backlog + worker CRUD + retention cleanup
   manage-worktree.ts           # Git worktree lifecycle: create/list/status/sync/merge/remove
   arbiter.ts                   # Dependency-aware next-task selection
   delegate.ts                  # Convenience API: task + isolation + worker + shared memory in one call
   docker-worker.ts             # Docker container spawning: single/batch + logs/wait/stop
   watchdog.ts                  # Health/feed/stale-requeue/retention/shared-memory-sync
   providers.ts                 # LLMProviderAdapter interface + GeminiAdapter + registry
   audit.ts                     # Append-only JSONL audit trail
   shared-memory.ts             # Neo4j knowledge graph client via MCP
   tracing.ts                   # OpenTelemetry SDK initialization + OTLP exporter
   __tests__/
      provider-contract.test.ts # 28-assertion contract test suite

scripts/
   mcp-trace-server.mjs         # GCP Trace MCP + auto-lifecycle for Jaeger + Neo4j

.agents/
   swarm/
      state.json                # Persistent state file
      audit.jsonl               # Append-only audit log
   mcp-servers/
      docker-manager-mcp/       # Docker container lifecycle MCP server
   workflows/
      master-agent-coordinator.md
   skills/
      (all skills with swarming evaluation hint)

.gemini/
   mcp.json                    # MCP server registrations including neo4j-memory
```

---

## Infrastructure Containers

### Jaeger (Trace Viewer)

```
Image:  jaegertracing/all-in-one:latest
Name:   swarm-jaeger
Ports:  16686 (UI), 4318 (OTLP HTTP)
Volume: none (ephemeral traces)
```

### Neo4j (Shared Memory)

```
Image:  neo4j:5
Name:   swarm-neo4j
Ports:  7474 (Browser UI), 7687 (Bolt)
Auth:   neo4j/agent-swarm-platform
Volume: swarm-neo4j-data:/data (persistent)
Env:    NEO4J_AUTH=neo4j/agent-swarm-platform, NEO4J_PLUGINS=["apoc"]
```

### Neo4j Memory MCP (Sidecar)

```
Image:  mcp/neo4j-memory
Mode:   interactive (stdio), ephemeral (--rm)
Env:    NEO4J_URL=bolt://host.docker.internal:7687
        NEO4J_USERNAME=neo4j
        NEO4J_PASSWORD=agent-swarm-platform
        NEO4J_DATABASE=neo4j
```

---

## 12-Step Build Order (External Agent Checklist)

1. Implement task state enums and persistence (JSON file store).
2. Implement backlog APIs (`add/list/assign/update/complete`) with task size validation.
3. Implement dependency-aware `next_task` arbiter.
4. Implement workspace isolation lifecycle (`create/list/status/sync/remove`) with capacity limits.
5. Implement interactive merge with 4 strategy modes and per-file resolution.
6. Implement worker runtime (`spawn/batch/status/result/logs/wait/stop`) with capacity enforcement.
7. Implement watchdog (`health/feed/stale-requeue/retention-cleanup`) with shared memory sync.
8. Implement provider adapter interface + GeminiAdapter + registry.
9. Implement OpenTelemetry tracing + auto-lifecycle Jaeger container.
10. Implement Neo4j shared memory client + auto-lifecycle container + convenience APIs.
11. Implement append-only audit logger integrated into all modules.
12. Add contract tests (28 provider assertions) + diagnostics + documentation.

---

## Agent Hint Propagation and Evaluation Logic

To ensure agents consistently consider swarm delegation, a ubiquitous hint propagation strategy is implemented across all entry points for agent work. This ensures that regardless of whether an agent starts from a skill, a workflow, or a direct prompt, it will always be prompted to evaluate the potential for parallel execution.

### Hint Block Requirement

Every skill file (e.g., `SKILL.md`), workflow file (e.g., `.md` in `workflows/`), and agent prompt template (e.g., `GEMINI.md`, `claude.md`, `.cursorrules`) must contain a standardized hint block. This block serves as a mandatory directive, guiding the agent to assess whether its current task could benefit from swarm delegation.

### Evaluation Criteria

The hint block will include key evaluation criteria to aid the agent's decision-making process. Agents should assess:

-   **Multi-file or Multi-component Nature:** Is the task inherently complex, spanning across multiple files, directories, or distinct software components?
-   **Independence of Sub-tasks:** Can the overall task be logically broken down into smaller, independent sub-tasks that do not require shared mutable state or tight synchronous communication?
-   **Benefit from Parallel Execution:** Would executing these sub-tasks concurrently significantly reduce the overall completion time or improve throughput?
-   **Justification of Isolation Overhead:** Is the task large enough or sufficiently complex to warrant the overhead associated with creating isolated Git worktrees and Docker containers for parallel processing? Trivial single-file edits are generally not suitable.

### Referencing the Master-Agent-Coordinator

The hint must explicitly reference the `master-agent-coordinator` workflow as the primary entry point for initiating swarm delegation. This provides a clear, actionable path for the agent to follow if it decides to delegate. The coordinator workflow handles the intricacies of task decomposition, worktree creation, worker assignment, and merge management.

### Concrete Hint Example

The following hint text should be appended to every skill and workflow file:

```
---
> **Swarm Delegation Evaluation:** Before executing this task sequentially, evaluate whether it can be decomposed into independent sub-tasks suitable for parallel agent swarming. If the task spans multiple files, components, or independent feature areas, consider delegating via the master-agent-coordinator workflow. Review `.agents/workflows/master-agent-coordinator.md` for orchestration instructions.
```

### Mandatory Root AI Directive

In addition to individual file hints, the root AI directive file (e.g., `GEMINI.md`, `claude.md`, `.cursorrules`) should contain a MANDATORY DIRECTIVE. This directive explicitly instructs the agent to always perform a swarming evaluation before commencing any multi-step work. This acts as a global safeguard, ensuring the evaluation logic is a fundamental part of the agent's initial planning phase.

### Universal Propagation Strategy

This layered propagation strategy ensures that every interaction point with an agent — be it through a specific skill, a general workflow, or a direct prompt — will present the opportunity for swarm evaluation. This guarantees consistency and maximizes the likelihood of efficient parallel processing where appropriate, fostering a "swarm-first" mindset without imposing it unconditionally.

### Non-Blocking Guidance

It is crucial that these hints are non-blocking. They serve as guidance and encouragement for evaluation, not as a强制 requirement for delegation. The agent retains full autonomy and should use its judgment based on the specific context and complexity of the task at hand. The goal is to inform and enable intelligent delegation, not to automate it blindly.

---

## Anti-Patterns to Avoid

1. No isolation for multi-file tasks.
2. Hidden scheduler rules (must be explicit and configurable).
3. Missing dependency checks before assignment.
4. Long-running tasks in shared context only (use Docker workers).
5. Logging protocol output and diagnostics to same channel (stdout vs stderr).
6. No cleanup strategy for stale workers/workspaces.
7. No single source of truth for tool metadata.
8. Hardcoded provider/model names in orchestration logic.
9. Shared memory operations that block on failure (must be non-fatal try/catch).
10. Infrastructure containers that don't auto-stop (leaked Docker resources).
11. Merge conflicts that silently abort with no detail (must report per-file status).
12. Audit logs that overwrite state (must be append-only).

---

## Source-Informed Notes from This Implementation

Important reusable lessons captured:

- Keep orchestration state persistent and human-inspectable (JSON files, not opaque binary).
- Give operators both granular tools and a convenience `delegate` abstraction.
- Separate "coordination" from "execution" from "observability" from "memory" planes.
- Pair orchestration with diagnostics/self-healing; do not treat ops as optional.
- Auto-lifecycle infrastructure containers with the AI session — zero manual docker commands.
- Shared memory should be non-blocking and failure-tolerant; it enhances but doesn't gate.
- Merge strategies should default to `theirs` for worker output — workers are the authority.
- Every state transition should appear in the audit log with actor identity and timestamps.
- Policy values should be centralized in one file, enforced at point-of-use, and easily tuneable.
- Contract tests should validate interface conformance, not implementation details — a mock adapter must pass the same suite as the real adapter.
- Neo4j persistent volumes ensure knowledge survives session restarts.
- Jaeger ephemeral storage is fine for debug traces — production traces go to GCP Cloud Trace.

---

## Definition of Done for a Successful Recreation

You can claim parity when your new toolchain can demonstrably:

1. Accept a backlog of dependent tasks and prioritize correctly.
2. Create isolated work contexts and run tasks without cross-contamination.
3. Auto-assign work based on capacity and dependency readiness.
4. Rebalance stale work and report health.
5. Run heavy tasks in true isolated parallel workers.
6. Merge completed work safely with configurable conflict resolution strategies.
7. Auto-resolve merge conflicts per-file using theirs/ours/union strategies.
8. Cleanup stale artifacts automatically based on retention policy.
9. Produce auditable state and logs suitable for regulated teams.
10. Instrument all operations with OpenTelemetry spans exported to a local trace viewer.
11. Share knowledge across agents via a persistent graph database.
12. Auto-start and auto-stop all infrastructure containers with the AI session lifecycle.
13. Pass 28 provider adapter contract tests with both real and mock adapters.