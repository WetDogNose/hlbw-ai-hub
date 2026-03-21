# Agent Swarm Replication Blueprint (Toolchain-Agnostic)

## Purpose

This document gives another agent enough detail to recreate the same swarm outcomes in a different toolchain, without requiring Python, Claude-specific internals, Docker-specific internals, or ANZ-specific infrastructure.

Target outcomes to replicate:

1. Parallel multi-task execution with coordination.
2. Safe isolation of code changes per task.
3. Backlog-driven orchestration with priorities and dependencies.
4. Health monitoring, stale-work rebalancing, and cleanup automation.
5. Optional true parallel workers with isolated runtime context.
6. Security and governance guardrails suitable for regulated environments.

## Read This First (No-Repo Reimplementation)

If the implementing agent has zero access to this repository, this blueprint is still sufficient if followed in order:

1. Build the **coordination plane** first (queue + isolation + arbiter + watchdog).
2. Add the **worker plane** second (spawn/status/result/wait/cleanup).
3. Integrate an **LLM provider adapter layer** (not provider-specific logic in core).
4. Add diagnostics, permission controls, and audit logging last.

Do not start with provider SDK wiring; start with orchestration state machines and contracts.

---

## What This Toolchain Actually Implements

The current implementation uses two orchestration planes:

1. **Coordination plane** (swarm orchestrator):
   - Work isolation lifecycle (create/list/status/sync/merge/remove)
   - Backlog lifecycle (add/list/assign/update/complete)
   - Arbitration (next task, conflict handling, stale rebalance)
   - Watchdog (health, feed, cleanup)
   - Convenience delegation API (one-call backlog + isolation + assignment)

2. **Execution plane** (A2A workers):
   - Spawn isolated workers for long or heavy tasks
   - Batch spawn for true concurrency
   - Status/result/logs/wait/stop/cleanup lifecycle
   - Optional mount of isolated task workspace

Core repo-level enablers around those planes:

- MCP server registration and discovery (`.mcp.json`)
- Skill registry as source of truth (`skills/skill.yaml`)
- Auto-generated command metadata (`.claude/commands/`)
- Session hooks for context + diagnostics
- Diagnostics and self-healing checks (`scripts/diagnostics/`)

---

## Capability Contract (Must-Haves)

Recreate these capabilities first; implementation details may vary:

### A. Isolation Contract

- Every non-trivial task can run in an isolated workspace/branch/sandbox.
- Isolation identity is stable (`task_id`, `workspace_id`, `branch_name`).
- Isolated work can be merged, synced, or discarded independently.

### B. Backlog Contract

- Task states: `pending`, `in_progress`, `blocked`, `completed`, `failed`, `cancelled`.
- Priority queue (1 highest to 5 lowest).
- Dependency support (`task B` blocked until `task A` is completed).
- Assignment metadata (`assigned_agent`, timestamps, metadata map).

### C. Arbitration Contract

- Determine next executable task by: status, dependency resolution, priority, age.
- Detect stale tasks by inactivity threshold.
- Requeue stale tasks safely with audit metadata.

### D. Watchdog Contract

- Health summary across queue + isolation resources.
- Auto-feed: assign pending tasks into available capacity.
- Cleanup: remove stale completed state and retired isolation resources.

### E. Worker Contract (optional but recommended)

- Spawn individual worker jobs with task payload.
- Spawn batch jobs in parallel.
- Poll status, collect result, stream logs, wait for completion, force stop.
- Enforce concurrency limit, task size limit, and timeout.

---

## Reference Architecture (Portable)

Implement these logical components (as services, libraries, or scripts):

1. **Orchestrator API**
   - Exposes coordination tools/endpoints.
   - Owns queue and isolation state machine.

2. **Worker Runtime Manager**
   - Starts/stops isolated workers.
   - Enforces resource/time limits.
   - Captures logs and results.

3. **State Store**
   - Persist backlog, isolation records, worker records.
   - Can be JSON files, SQLite, Redis, Postgres, etc.

4. **Isolation Manager**
   - Creates/removes/syncs isolated code workspaces.
   - Abstract this so you can swap git worktrees for alternatives.

5. **Diagnostics + Policy Layer**
   - Environment checks, auth checks, dependency checks.
   - Security validation and self-heal routines.

6. **Agent UX Layer**
   - Tool registration/discovery.
   - Command metadata generation from single source of truth.
   - Session bootstrap hooks.

7. **Model Provider Adapter Layer (mandatory)**
   - Normalizes model invocation across providers.
   - Shields core orchestrator from provider-specific auth, SDKs, and response formats.

---

## Model Provider Agnostic Design

### Provider-Neutral Interface

Your worker runtime should call a stable interface like:

- `generate(request) -> response`
- `stream(request) -> event stream` (optional)
- `estimate_cost(request) -> estimate` (optional)
- `healthcheck() -> status`

Where `request` includes:

- `system_prompt`
- `user_prompt`
- `model_id` (provider-specific string, but treated as opaque by orchestrator)
- `max_tokens`, `temperature`, `timeout`
- `metadata` (task_id, worker_id)

Where `response` includes:

- `text`
- `input_tokens`, `output_tokens`, `total_tokens` (nullable if unavailable)
- `provider`
- `model_id`
- `finish_reason`
- `raw` (optional raw payload for debugging)

### Adapter Strategy

Implement one adapter per provider:

- `GeminiAdapter`
- `OpenAIOrCopilotAdapter` (for OpenAI/Azure OpenAI/GitHub Copilot-backed APIs)
- `AnthropicAdapter`
- `LocalModelAdapter` (Ollama/vLLM/LM Studio)

Core orchestrator and scheduler must never branch on provider names; it only calls the generic adapter interface.

### Authentication Strategy (Provider-Neutral)

- Prefer environment-injected credentials or secure secret manager.
- Do not hardcode project IDs, endpoints, tenant IDs, or model names in orchestration logic.
- Keep provider config in external runtime configuration (`providers.yaml`, env vars, secret references).

---

## Data Model Blueprint

Use a normalized model equivalent to the following:

### Task Record

- `id` (string)
- `title` (string)
- `description` (string)
- `priority` (int 1..5)
- `status` (enum)
- `dependencies` (list task ids)
- `blocked_by` (list task ids)
- `assigned_agent` (string|null)
- `feature_branch_or_workspace` (string|null)
- `isolation_path` (string|null)
- `created_at`, `started_at`, `completed_at` (timestamps)
- `metadata` (object)

### Isolation Record

- `id` or `branch`
- `path`
- `status` (`active`, `merging`, `merged`, `conflict`, `abandoned`)
- `task_id`
- `created_at`, `last_activity`
- optional stats (`ahead`, `behind`, `files_changed`, `has_conflicts`)

### Worker Record

- `id`
- `runtime_id` (container/job/process id)
- `task` (prompt/payload)
- `model_or_executor`
- `status` (`pending`, `starting`, `running`, `completed`, `failed`, `timeout`, `cancelled`)
- `isolation_path`
- `result`, `error`, `tokens_or_cost`
- `created_at`, `started_at`, `completed_at`
- `metadata`

### Provider Config Record

- `provider_name` (gemini/openai/copilot/anthropic/local)
- `enabled` (bool)
- `endpoint` (nullable)
- `default_model` (string)
- `auth_mode` (api_key/oauth/workload_identity/managed_identity)
- `rate_limit_per_minute` (optional)
- `max_concurrency` (optional)
- `retry_policy` (object)

---

## API/Tool Surface to Recreate

Map these capabilities into your own API names:

### Isolation

- `create`
- `list`
- `status`
- `sync`
- `merge`
- `remove`

### Backlog

- `add`
- `list`
- `assign`
- `update`
- `complete`

### Arbiter

- `next_task`
- `resolve_conflict`
- `rebalance_stale`

### Watchdog

- `health`
- `feed`
- `cleanup`

### Swarm Convenience

- `delegate(task, priority, agent_type)`
  - Creates task
  - Creates isolation
  - Assigns worker
  - Returns runnable instructions

### Worker Runtime

- `setup`
- `spawn`
- `spawn_batch`
- `status`
- `result`
- `logs`
- `wait`
- `stop`
- `cleanup`

### Provider Management

- `providers_list`
- `provider_set_default`
- `provider_test`
- `provider_estimate` (optional)

---

## Scheduling and Decision Policies

Implement these explicit policies (don’t leave implicit):

1. **Delegation policy**
   - Trivial/single-line tasks: direct execution.
   - Medium tasks: task agents with shared context.
   - Heavy independent tasks: isolated parallel workers.

2. **Queue selection policy**
   - Eligible = `pending` and dependencies completed.
   - Sort by `(priority asc, created_at asc)`.

3. **Capacity policy**
   - Max active isolation units (example: 10).
   - Max active workers (example: 5).

4. **Staleness policy**
   - If `in_progress` and no activity > threshold, return to `pending`.
   - Increment stale count and track previous assignment.

5. **Cleanup policy**
   - Remove old completed tasks after retention days.
   - Remove merged/abandoned isolation units.
   - Keep a configurable number of recent worker records.

6. **Provider fallback policy**
   - If preferred provider is unavailable, fallback to next allowed provider.
   - Preserve deterministic ordering of fallback providers.
   - Persist provider used per worker for audit and cost tracking.

---

## Security and Governance Requirements

These are non-negotiable if you want comparable reliability:

1. **Input validation**
   - Validate branch/workspace identifiers with strict allowlists.
   - Enforce max lengths and reject traversal/meta characters.

2. **Command execution hardening**
   - Use argument arrays, not shell interpolation.
   - Set command timeouts.
   - Capture stdout/stderr and return structured errors.

3. **Least privilege**
   - Default to read-only allowed commands for agents.
   - Explicitly gate write/deploy/destroy operations.

4. **Credential handling**
   - Inherit from secure host env or secret store.
   - Never log secrets.
   - Mount only required credentials per worker.

5. **Transport safety**
   - If using stdio MCP style, reserve stdout for protocol and send logs to stderr.

6. **Auditability**
   - Persist task/worker transitions and merge actions.
   - Include timestamps, actor identity, and reason metadata.

7. **Quality gates**
   - Lint, tests, security scans integrated into orchestration workflow.

8. **Provider isolation**
   - Restrict which task classes may use which providers.
   - Separate credentials between development and production contexts.
   - Enforce outbound domain/endpoint allowlists.

---

## Operations Playbook

### Session bootstrap

- Load workspace/system context for the orchestrator.
- Run fast health diagnostics.
- Validate server/tool registrations.

### Continuous operations loop

1. `health`
2. `feed`
3. monitor + `rebalance_stale`
4. merge/complete finished tasks
5. `cleanup`

### Failure recovery

- Conflict path: detect -> analyze -> choose resolution -> retry merge.
- Worker timeout path: stop -> mark timeout -> optionally requeue.
- Capacity exhaustion: cleanup completed resources before adding new work.

---

## Testing Strategy (Replicate This)

1. **Unit tests for state machines**
   - Task transitions and dependency behavior.
   - Arbiter selection and stale rebalance.

2. **Unit tests for isolation validation**
   - Valid and invalid identifiers.
   - Limit and conflict handling.

3. **Worker orchestration tests (mock runtime)**
   - Spawn limits, timeout handling, result parsing, cleanup.

4. **Contract tests for API/tool inventory**
   - Assert all expected tools are registered.

5. **Diagnostics tests**
   - Environment missing cases produce actionable remediation messages.

6. **Provider adapter conformance tests**
    - Every provider adapter must satisfy identical request/response contract tests.
    - Include timeout, retry, auth-failure, and malformed-response cases.

---

## From-Scratch Implementation Scaffold

Use this baseline layout in any language stack:

```text
swarm-platform/
   orchestrator/
      api/
      scheduler/
      arbiter/
      watchdog/
      isolation/
   workers/
      runtime/
      adapters/
         gemini/
         copilot_openai/
         anthropic/
         local/
   state/
      migrations/
      repositories/
   policy/
      permissions/
      validation/
      audit/
   diagnostics/
   docs/
      operations/
      api/
   tests/
      unit/
      contract/
      integration/
```

---

## Minimal API Schemas (Provider-Neutral)

### Create Task

Request:

```json
{
   "title": "Implement API rate limiting",
   "description": "Add gateway-level and handler-level rate limiting",
   "priority": 2,
   "dependencies": ["task-1234"]
}
```

Response:

```json
{
   "task_id": "task-9876",
   "status": "pending"
}
```

### Delegate Task

Request:

```json
{
   "task": "Implement OAuth flow",
   "priority": 2,
   "agent_type": "general",
   "preferred_provider": "gemini"
}
```

Response:

```json
{
   "task_id": "task-1111",
   "workspace_id": "ws-1111",
   "instructions": "Run worker in isolated workspace ws-1111"
}
```

### Spawn Worker

Request:

```json
{
   "task_id": "task-1111",
   "prompt": "Implement OAuth flow and tests",
   "provider": "copilot_openai",
   "model_id": "gpt-4.1",
   "workspace_id": "ws-1111",
   "timeout_minutes": 30
}
```

Response:

```json
{
   "worker_id": "worker-2222",
   "status": "running"
}
```

---

## Migration/Implementation Plan for Another Toolchain

### Phase 1: Coordination Core

- Implement queue + isolation + arbiter + watchdog.
- Use simple local persistent storage first.

### Phase 2: Worker Runtime

- Add isolated worker process model.
- Add spawn, status, wait, result, cleanup.

### Phase 3: Agent UX and Automation

- Add tool registration and discovery.
- Add session hooks, diagnostics, self-heal routines.
- Add command metadata generation from one source-of-truth manifest.

### Phase 4: Hardening

- Concurrency control, quotas, retention, policy controls.
- Security scans, audit logs, compliance mappings.

### Phase 5: Multi-Provider Production Readiness

- Add at least 2 provider adapters (example: Gemini + Copilot/OpenAI).
- Add provider failover and health-based routing.
- Add per-provider budget and concurrency controls.

---

## 10-Step Build Order (External Agent Checklist)

1. Implement task state enums and persistence.
2. Implement backlog APIs (`add/list/update`).
3. Implement dependency-aware `next_task` arbiter.
4. Implement workspace isolation lifecycle (`create/status/remove`).
5. Implement assignment and completion flows.
6. Implement watchdog (`health/feed/rebalance/cleanup`).
7. Implement worker runtime (`spawn/status/result/wait/stop`).
8. Implement provider adapter interface + one adapter.
9. Add second provider adapter + fallback policy.
10. Add contract tests, diagnostics, and audit exports.

---

## Anti-Patterns to Avoid

1. No isolation for multi-file tasks.
2. Hidden scheduler rules (must be explicit).
3. Missing dependency checks before assignment.
4. Long-running tasks in shared context only.
5. Logging protocol output and diagnostics to same channel.
6. No cleanup strategy for stale workers/workspaces.
7. No single source of truth for tool metadata.

---

## Source-Informed Notes from This Toolchain

Important reusable lessons captured from the current implementation:

- Keep orchestration state persistent and human-inspectable.
- Give operators both granular tools and a convenience `delegate` abstraction.
- Separate “coordination” from “execution” planes.
- Pair orchestration with diagnostics/self-healing; do not treat ops as optional.
- Treat documentation sync as part of runtime integrity (skill manifest -> command metadata).
- In multi-repo environments, codify permission patterns and workspace context early.

---

## Definition of Done for a Successful Recreation

You can claim parity when your new toolchain can demonstrably:

1. Accept a backlog of dependent tasks and prioritize correctly.
2. Create isolated work contexts and run tasks without cross-contamination.
3. Auto-assign work based on capacity and dependency readiness.
4. Rebalance stale work and report health.
5. Run heavy tasks in true isolated parallel workers.
6. Merge completed work safely with conflict workflows.
7. Cleanup stale artifacts automatically.
8. Produce auditable state and logs suitable for regulated teams.
