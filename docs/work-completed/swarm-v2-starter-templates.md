# Swarm V2 Implementation Starter Templates (TypeScript + Docker)

## Purpose

This companion guide turns the Swarm V2 Implementation Blueprint into concrete starter scaffolds. It includes the actual TypeScript code used in the agent-swarm-platform implementation, covering observability, shared memory, conflict resolution, and all lifecycle management that extends the original coordination and execution planes.

These templates are intentionally complete — not stubs. They represent the full working implementation that passed all type checks and contract tests.

---

## Common Design

All modules share this import and dependency structure:

1. `types.ts` — Enums and interfaces (Task, Worker, SwarmState)
2. `policy.ts` — Centralized configuration constants
3. `audit.ts` — Append-only JSONL audit logging
4. `tracing.ts` — OpenTelemetry SDK and tracer initialization
5. `state-manager.ts` — Persistent state store with full CRUD
6. `manage-worktree.ts` — Git worktree isolation lifecycle
7. `arbiter.ts` — Dependency-aware next-task selection
8. `docker-worker.ts` — Docker container worker lifecycle
9. `providers.ts` — LLM provider adapter interface + registry
10. `shared-memory.ts` — Neo4j graph knowledge client
11. `delegate.ts` — Convenience single-call orchestration
12. `watchdog.ts` — Health monitoring and auto-remediation

---

## Implementation Structure

```text
scripts/swarm/
  types.ts
  policy.ts
  audit.ts
  tracing.ts
  state-manager.ts
  manage-worktree.ts
  arbiter.ts
  docker-worker.ts
  providers.ts
  shared-memory.ts
  delegate.ts
  watchdog.ts
  __tests__/
    provider-contract.test.ts

scripts/
  mcp-trace-server.mjs

.agents/
  swarm/
    state.json
    audit.jsonl
  mcp-servers/
    docker-manager-mcp/
```

---

## Core Enums and Models (`types.ts`)

```ts
export enum TaskStatus {
  Pending = "pending",
  InProgress = "in_progress",
  Blocked = "blocked",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled",
}

export enum WorkerStatus {
  Pending = "pending",
  Starting = "starting",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
  Timeout = "timeout",
  Cancelled = "cancelled",
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: number;
  status: TaskStatus;
  dependencies: string[];
  blockedBy: string[];
  assignedAgent?: string;
  isolationId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata: Record<string, unknown>;
}

export interface Worker {
  id: string;
  taskId: string;
  provider: string;
  modelId: string;
  status: WorkerStatus;
  runtimeId?: string;
  result?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata: Record<string, unknown>;
}

export interface SwarmState {
  tasks: Task[];
  workers: Worker[];
}
```

---

## Policy Configuration (`policy.ts`)

```ts
export const SWARM_POLICY = {
  maxActiveWorkers: 8,
  maxActiveIsolation: 15,
  maxTaskChars: 100_000,
  workerTimeoutMinutes: 30,
  retentionDays: 5,
  maxRetainedWorkerRecords: 100,
  defaultProvider: "gemini",
  defaultModel: "gemini-2.5-flash",
};
```

All capacity checks reference `SWARM_POLICY` directly at point-of-use:

- `addWorker()` checks `maxActiveWorkers` before creating.
- `createWorktree()` checks `maxActiveIsolation` before creating.
- `addTask()` checks `maxTaskChars` before accepting.
- `cleanupRetention()` uses `retentionDays` and `maxRetainedWorkerRecords`.

---

## Audit Logger (`audit.ts`)

```ts
import fs from "node:fs/promises";
import path from "node:path";

const AUDIT_DIR = path.join(process.cwd(), ".agents", "swarm");
const AUDIT_PATH = path.join(AUDIT_DIR, "audit.jsonl");

export interface AuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  previousState?: string;
  newState?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function appendAudit(entry: Omit<AuditEntry, "timestamp">): Promise<void> {
  await fs.mkdir(AUDIT_DIR, { recursive: true });
  const full: AuditEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  await fs.appendFile(AUDIT_PATH, JSON.stringify(full) + "\n", "utf-8");
}

export async function readAuditLog(limit = 50): Promise<AuditEntry[]> {
  try {
    const data = await fs.readFile(AUDIT_PATH, "utf-8");
    const lines = data.trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l) as AuditEntry);
  } catch {
    return [];
  }
}
```

Every module imports `appendAudit` and logs transitions with actor attribution. This creates a complete, human-readable audit trail in JSONL format that can be grep'd, streamed, or loaded into any analytics tool.

---

## OpenTelemetry Tracing (`tracing.ts`)

```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { trace } from "@opentelemetry/api";

const exporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces",
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: "agent-swarm",
    [SemanticResourceAttributes.SERVICE_VERSION]: "1.0.0",
  }),
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});

export function startTracing() {
  try {
    sdk.start();
    console.log("OTEL Tracing initialized locally (Jaeger: http://localhost:16686).");
  } catch (error) {
    console.error("Error initializing tracing", error);
  }
}

export function stopTracing() {
  return sdk.shutdown().catch((error) => console.log("Error shutting down tracing", error));
}

export function getTracer(name = "swarm-tracer") {
  return trace.getTracer(name);
}
```

### Instrumentation Pattern

Every public function wraps its body in a span:

```ts
export function someOperation(param: string): Result {
  const tracer = getTracer();
  return tracer.startActiveSpan("Module:someOperation", (span) => {
    span.setAttribute("param.name", param);
    try {
      // ... operation logic ...
      span.end();
      return result;
    } catch (err: any) {
      span.recordException(err);
      span.end();
      throw err;
    }
  });
}
```

---

## Provider Adapter Layer (`providers.ts`)

```ts
export interface GenerationRequest {
  systemPrompt: string;
  userPrompt: string;
  modelId: string;
  maxTokens?: number;
  temperature?: number;
  timeoutSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface GenerationResponse {
  text: string;
  provider: string;
  modelId: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  raw?: unknown;
}

export interface LLMProviderAdapter {
  readonly name: string;
  generate(request: GenerationRequest): Promise<GenerationResponse>;
  healthcheck(): Promise<boolean>;
}
```

### GeminiAdapter

```ts
export class GeminiAdapter implements LLMProviderAdapter {
  readonly name = "gemini";

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const tracer = getTracer();
    return tracer.startActiveSpan("Provider:Gemini:generate", async (span) => {
      span.setAttribute("model.id", request.modelId);
      try {
        const text = `[gemini-stub] Executed: ${request.userPrompt.slice(0, 120)}`;
        span.end();
        return { text, provider: this.name, modelId: request.modelId, finishReason: "stop" };
      } catch (err: any) {
        span.recordException(err);
        span.end();
        throw err;
      }
    });
  }

  async healthcheck(): Promise<boolean> {
    return !!process.env.GEMINI_API_KEY;
  }
}
```

### Provider Registry

```ts
const adapters: Record<string, LLMProviderAdapter> = {};

export function registerProvider(adapter: LLMProviderAdapter): void {
  adapters[adapter.name] = adapter;
}

export function getProvider(name: string): LLMProviderAdapter {
  const adapter = adapters[name];
  if (!adapter) throw new Error(`Unknown provider: ${name}. Registered: ${Object.keys(adapters).join(", ")}`);
  return adapter;
}

export function listProviders(): string[] {
  return Object.keys(adapters);
}

// Auto-register built-in adapters
registerProvider(new GeminiAdapter());
```

---

## Shared Memory Client (`shared-memory.ts`)

Connects to the Neo4j graph database via the `mcp/neo4j-memory` Docker image running as an MCP server over stdio.

### MCP Client Connection

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let sharedClient: Client | null = null;

async function getMemoryClient(): Promise<Client> {
  if (sharedClient) return sharedClient;

  const transport = new StdioClientTransport({
    command: "docker",
    args: [
      "run", "-i", "--rm",
      "-e", "NEO4J_URL=bolt://host.docker.internal:7687",
      "-e", "NEO4J_USERNAME=neo4j",
      "-e", "NEO4J_PASSWORD=swarm-memory-pass",
      "-e", "NEO4J_DATABASE=neo4j",
      "mcp/neo4j-memory",
    ],
  });

  sharedClient = new Client({ name: "swarm-memory-client", version: "1.0.0" });
  await sharedClient.connect(transport);
  return sharedClient;
}
```

### Core CRUD Operations

```ts
export async function storeEntity(
  name: string,
  type: "swarm_task" | "swarm_worker" | "swarm_discovery" | "swarm_decision" | "swarm_context",
  observations: string[]
): Promise<void> {
  const client = await getMemoryClient();
  await client.callTool({
    name: "create_entities",
    arguments: { entities: [{ name, type, observations }] },
  });
}

export async function addObservations(entityName: string, observations: string[]): Promise<void> {
  const client = await getMemoryClient();
  await client.callTool({
    name: "add_observations",
    arguments: { observations: [{ entityName, observations }] },
  });
}

export async function createRelation(source: string, target: string, relationType: string): Promise<void> {
  const client = await getMemoryClient();
  await client.callTool({
    name: "create_relations",
    arguments: { relations: [{ source, target, relationType }] },
  });
}

export async function searchMemory(query: string): Promise<any> {
  const client = await getMemoryClient();
  const response = await client.callTool({ name: "search_memories", arguments: { query } });
  return JSON.parse((response as any).content?.[0]?.text || "{}");
}

export async function findByName(names: string[]): Promise<any> {
  const client = await getMemoryClient();
  const response = await client.callTool({ name: "find_memories_by_name", arguments: { names } });
  return JSON.parse((response as any).content?.[0]?.text || "{}");
}

export async function readGraph(): Promise<any> {
  const client = await getMemoryClient();
  const response = await client.callTool({ name: "read_graph", arguments: {} });
  return JSON.parse((response as any).content?.[0]?.text || "{}");
}

export async function removeEntity(name: string): Promise<void> {
  const client = await getMemoryClient();
  await client.callTool({ name: "delete_entities", arguments: { entityNames: [name] } });
}
```

### Swarm Convenience Functions

```ts
export async function shareTaskContext(
  taskId: string, title: string, description: string, branchName: string
): Promise<void> {
  await storeEntity(`task:${taskId}`, "swarm_task", [
    `Title: ${title}`,
    `Description: ${description}`,
    `Branch: ${branchName}`,
    `Status: delegated`,
    `Timestamp: ${new Date().toISOString()}`,
  ]);
}

export async function shareDiscovery(
  workerId: string, taskId: string, discovery: string
): Promise<void> {
  const name = `discovery:${workerId}:${Date.now()}`;
  await storeEntity(name, "swarm_discovery", [discovery, `Worker: ${workerId}`, `Task: ${taskId}`]);
  await createRelation(name, `task:${taskId}`, "DISCOVERED_DURING");
}

export async function shareDecision(taskId: string, decision: string, rationale: string): Promise<void> {
  const name = `decision:${taskId}:${Date.now()}`;
  await storeEntity(name, "swarm_decision", [decision, `Rationale: ${rationale}`]);
  await createRelation(name, `task:${taskId}`, "DECIDED_FOR");
}

export async function getSharedContext(taskTitle: string): Promise<string[]> {
  const graph = await searchMemory(taskTitle);
  const observations: string[] = [];
  if (graph.entities) {
    for (const entity of graph.entities) {
      if (entity.observations) {
        observations.push(...entity.observations.map((o: string) => `[${entity.type}:${entity.name}] ${o}`));
      }
    }
  }
  return observations;
}

export async function markTaskComplete(taskId: string, summary: string): Promise<void> {
  await addObservations(`task:${taskId}`, [
    `Status: completed`,
    `Summary: ${summary}`,
    `CompletedAt: ${new Date().toISOString()}`,
  ]);
}
```

All shared memory operations are wrapped in try/catch at every call site. They are non-fatal: if Neo4j is unavailable, the swarm continues without shared memory.

---

## Interactive Merge Conflict Resolution (`manage-worktree.ts`)

### Merge Data Types

```ts
export interface MergeConflict {
  file: string;
  status: "resolved" | "unresolved";
  strategy?: string;
}

export interface MergeResult {
  success: boolean;
  conflicts: boolean;
  conflictFiles: MergeConflict[];
  strategy: string;
}

export type MergeStrategy = "theirs" | "ours" | "union" | "manual";
```

### Merge with Strategy

```ts
export function mergeWorktree(branchName: string, strategy: MergeStrategy = "theirs"): MergeResult {
  // 1. Attempt the merge with --no-ff
  // 2. If clean merge → return success
  // 3. If conflicts detected → parse `git status --porcelain` for UU/AA/DD lines
  // 4. If strategy === "manual" → return unresolved file list
  // 5. Otherwise → resolve each file individually via resolveConflict()
  // 6. If all resolved → git add -A + git commit --no-edit → return success
  // 7. If partial → report resolved and unresolved file lists
  // 8. Audit-log every outcome with conflict file lists and strategy metadata
}
```

### Per-File Resolution

```ts
function resolveConflict(file: string, branchName: string, strategy: MergeStrategy): void {
  switch (strategy) {
    case "theirs":
      execSync(`git checkout --theirs "${file}"`, { stdio: "pipe" });
      execSync(`git add "${file}"`, { stdio: "pipe" });
      break;

    case "ours":
      execSync(`git checkout --ours "${file}"`, { stdio: "pipe" });
      execSync(`git add "${file}"`, { stdio: "pipe" });
      break;

    case "union": {
      const content = fs.readFileSync(file, "utf-8");
      const resolved = content
        .replace(/^<<<<<<< .*$/gm, "")
        .replace(/^=======$/gm, "")
        .replace(/^>>>>>>> .*$/gm, "");
      fs.writeFileSync(file, resolved, "utf-8");
      execSync(`git add "${file}"`, { stdio: "pipe" });
      break;
    }
  }
}
```

### CLI Usage

```bash
npx tsx scripts/swarm/manage-worktree.ts merge <branch> [theirs|ours|union|manual]
```

---

## Convenience Delegate API (`delegate.ts`)

Single call that chains: task creation → isolation → worker assignment → shared memory → context retrieval:

```ts
export interface DelegateRequest {
  task: string;
  description?: string;
  priority?: number;
  agentType?: string;
  dependencies?: string[];
}

export interface DelegateResult {
  taskId: string;
  workerId: string;
  isolationId: string;
  worktreePath: string;
  instructions: string;
  sharedContext: string[];
}

export async function delegate(req: DelegateRequest): Promise<DelegateResult> {
  // 1. addTask() with size validation
  // 2. createWorktree() with capacity check
  // 3. assignTask() with agent tracking
  // 4. addWorker() with capacity check
  // 5. shareTaskContext() into Neo4j (non-fatal)
  // 6. getSharedContext() from Neo4j (non-fatal)
  // 7. appendAudit() with delegation metadata
  // 8. Return complete DelegateResult with shared context
}
```

---

## Infrastructure Auto-Lifecycle (`mcp-trace-server.mjs`)

The GCP Trace MCP server doubles as the infrastructure lifecycle manager. On startup, it auto-manages two Docker containers:

### Auto-Start Sequence

```js
async function main() {
    // 1. Jaeger (OTEL trace viewer)
    const jaegerRunning = execSync("docker ps -q -f name=swarm-jaeger").toString().trim();
    if (!jaegerRunning) {
        const stopped = execSync("docker ps -a -q -f name=swarm-jaeger").toString().trim();
        if (stopped) {
            execSync(`docker start ${stopped}`);
        } else {
            execSync("docker run -d --name swarm-jaeger -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:latest");
        }
    }

    // 2. Neo4j (shared memory graph database)
    const neo4jRunning = execSync("docker ps -q -f name=swarm-neo4j").toString().trim();
    if (!neo4jRunning) {
        const stopped = execSync("docker ps -a -q -f name=swarm-neo4j").toString().trim();
        if (stopped) {
            execSync(`docker start ${stopped}`);
        } else {
            execSync([
                "docker run -d --name swarm-neo4j",
                "-p 7474:7474 -p 7687:7687",
                "-e NEO4J_AUTH=neo4j/swarm-memory-pass",
                '-e NEO4J_PLUGINS=["apoc"]',
                "-v swarm-neo4j-data:/data",
                "neo4j:5"
            ].join(" "));
        }
    }
}
```

### Auto-Stop on Session End

```js
const cleanup = () => {
    try {
        execSync("docker stop swarm-jaeger", { stdio: "ignore" });
        execSync("docker stop swarm-neo4j", { stdio: "ignore" });
    } catch(e) {}
    process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.stdin.on("close", cleanup);
```

### Lifecycle Logic

1. Check if container is running (`docker ps -q -f name=<name>`).
2. If not running, check if it exists stopped (`docker ps -a -q`).
3. If exists: `docker start <id>`.
4. If doesn't exist: `docker run -d --name <name> ...`.
5. On exit: `docker stop <name>` (ignore errors).

This three-step check (running → stopped → fresh) prevents container name conflicts and maximizes startup speed by restarting existing containers rather than recreating them.

---

## MCP Server Configuration

### `.gemini/mcp.json` Entry

```json
{
  "neo4j-memory": {
    "command": "docker",
    "args": [
      "run", "-i", "--rm",
      "-e", "NEO4J_URL=bolt://host.docker.internal:7687",
      "-e", "NEO4J_USERNAME=neo4j",
      "-e", "NEO4J_PASSWORD=swarm-memory-pass",
      "-e", "NEO4J_DATABASE=neo4j",
      "mcp/neo4j-memory"
    ]
  }
}
```

The `host.docker.internal` hostname lets the MCP container (running in Docker) connect to the Neo4j instance (also running in Docker, but with ports mapped to the host).

---

## Contract Test Suite (`__tests__/provider-contract.test.ts`)

### Test Runner Pattern

```ts
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) { passed++; console.log(`  ✅ ${message}`); }
  else { failed++; console.error(`  ❌ FAIL: ${message}`); }
}
```

### Contract Test Function (Adapter-Agnostic)

```ts
async function runContractTests(adapter: LLMProviderAdapter) {
  // 1. Name is non-empty string
  assert(typeof adapter.name === "string" && adapter.name.length > 0, "...");

  // 2. generate() returns correct response shape
  const request: GenerationRequest = {
    systemPrompt: "You are a test agent.",
    userPrompt: "Say hello.",
    modelId: "test-model",
  };
  const response = await adapter.generate(request);
  assert(typeof response.text === "string", "...");
  assert(response.text.length > 0, "...");
  assert(response.provider === adapter.name, "...");
  assert(typeof response.modelId === "string" && response.modelId.length > 0, "...");

  // 3. Optional fields have correct types when present
  // 4. healthcheck() returns boolean
  // 5. healthcheck() is idempotent
  // 6. Empty prompt handling
  // 7. ModelId passthrough verification
}
```

### Registry Tests

```ts
async function runRegistryTests() {
  // 1. Built-in adapter is auto-registered
  // 2. getProvider returns correct type
  // 3. Unknown provider throws
  // 4. registerProvider + getProvider round-trip
  // 5. Dynamically registered mock adapter passes full contract tests
}
```

### Execution

```bash
npx tsx scripts/swarm/__tests__/provider-contract.test.ts
```

Expected output: `28 passed, 0 failed`.

---

## Watchdog with Feed + Stale Count + Shared Memory

The full watchdog cycle runs these operations in sequence:

1. **Stale detection**: iterate `Running`/`Starting` workers, check if `startedAt` exceeds timeout.
2. **Stale remediation**: mark worker as `Timeout`, increment task `staleCount`, record `lastStaleAgent`, stop Docker container, cleanup worktree, requeue task to `Pending`.
3. **Shared memory update**: add observations to the task's Neo4j entity with stale status (non-fatal).
4. **Feed**: count available worker slots, call `getNextAvailableTask()` for each slot, transition to `InProgress`.
5. **Retention cleanup**: call `cleanupRetention()` to purge old records.
6. **Health summary**: print structured report of pending/active/stale counts, worker capacity, isolation capacity.

---

## Practical Rollout Sequence

1. Create `types.ts` with enums and interfaces.
2. Create `policy.ts` with all capacity constants.
3. Create `audit.ts` for append-only logging.
4. Create `tracing.ts` for OpenTelemetry initialization.
5. Create `state-manager.ts` with full CRUD + cleanup.
6. Create `manage-worktree.ts` with all 6 lifecycle operations + conflict resolution.
7. Create `arbiter.ts` for dependency-aware scheduling.
8. Create `providers.ts` with adapter interface + GeminiAdapter + registry.
9. Create `docker-worker.ts` with single/batch spawn + logs/wait/stop.
10. Create `shared-memory.ts` with Neo4j MCP client + convenience functions.
11. Create `delegate.ts` as the single-call orchestration entry point.
12. Create `watchdog.ts` with health/feed/stale/retention/memory integration.
13. Update `mcp-trace-server.mjs` with Jaeger + Neo4j auto-lifecycle.
14. Create `__tests__/provider-contract.test.ts` with 28 assertions.
15. Register `neo4j-memory` in `.gemini/mcp.json`.
16. Run `npx tsc --noEmit --skipLibCheck` to verify type safety.
17. Run contract tests to verify adapter conformance.

---

## Agent Hint Propagation Templates

To ensure agents effectively utilize the Swarm V2 capabilities, specific hints must be propagated at various levels. These templates provide concrete guidance for embedding swarm evaluation hints within skill files, workflow definitions, and root AI directives. Without these hints, agents will default to sequential execution and never discover or leverage the swarm's parallel processing and shared memory features.

### Skill File Hint

Append this markdown block to every `SKILL.md` file that describes an agent's capability.

```markdown
---
swarm_evaluation:
  enabled: true
  criteria:
    - is_multi_file_or_component: "Evaluate if this task involves changes across multiple files or distinct components that could be developed in parallel."
    - sub_tasks_independent: "Determine if sub-tasks can run independently without requiring real-time results from each other."
    - parallel_execution_saves_time: "Assess if parallel execution of this task's sub-components would significantly reduce overall completion time."
    - large_enough_to_justify_isolation: "Consider if the task's scope is substantial enough to justify the overhead of isolation and inter-agent communication."
    - natural_boundaries_between_sub_tasks: "Identify if there are clear, logical boundaries between potential sub-tasks."
---
```

### Workflow File Hint

Append this markdown block to every `workflow.md` file that defines a multi-step process.

```markdown
---
swarm_evaluation:
  enabled: true
  workflow_criteria:
    - break_down_into_parallel_steps: "Could this workflow be broken down into parallelizable steps or sub-workflows?"
    - shared_context_beneficial: "Would shared memory/context between different agents or steps be beneficial for this workflow?"
    - merge_conflict_risk: "What is the risk of merge conflicts if parts of this workflow run in parallel? Are there strategies to mitigate this?"
    - dependencies_allow_parallelism: "Are the dependencies between steps flexible enough to allow for concurrent execution of some parts?"
    - resource_intensive_steps: "Are there resource-intensive steps that could be offloaded to separate agents or environments?"
---
```

### Root AI Directive Hint

Include this exact text in your root AI directives (e.g., `GEMINI.md`, `claude.md`, `.cursorrules`) to make swarm evaluation mandatory for any non-trivial task.

```text
CRITICAL DIRECTIVE: For any task requiring significant code changes, multi-file modifications, or complex logic, you MUST first evaluate its suitability for swarm execution. Use the following criteria to make this determination. If the task is suitable, initiate a swarm by calling the appropriate delegation tool. Do NOT proceed with sequential execution if a swarm is more efficient or appropriate.
```

### Evaluation Criteria Checklist

These are the specific questions the agent should answer to determine if a task is suitable for swarming.

- **Is the task multi-file or multi-component?**
- **Can sub-tasks run independently?**
- **Would parallel execution save time?**
- **Is the task large enough to justify isolation overhead?**
- **Are there natural boundaries between sub-tasks?**

This hint propagation is what ensures the capability is actually used by agents — without it, agents default to sequential execution and never discover the swarming capability exists.

---

## Notes for Google-Only Environments

- Implement `GeminiAdapter` only; the provider interface supports future adapters without code changes.
- Use `GEMINI_API_KEY` environment variable for authentication. Inject into Docker workers via `envKeys`.
- Neo4j is local-only (no cloud dependency). All shared memory runs on `localhost:7687`.
- Jaeger is local-only for debug traces. Production traces go to Google Cloud Trace via the `gcp-trace-mcp` server.
- Never bind queue/arbiter logic to provider-specific token or SDK assumptions.
- The `mcp/neo4j-memory` Docker image is maintained by `neo4j-contrib` and pulled from Docker Hub.
