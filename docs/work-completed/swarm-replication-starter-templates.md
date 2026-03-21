# Swarm Replication Starter Templates (Python + TypeScript)

## Purpose

This companion guide turns the blueprint into concrete starter scaffolds for two common stacks:

- Python (FastAPI-style orchestration service)
- TypeScript (Node/Express-style orchestration service)

These templates are intentionally minimal but complete enough to bootstrap a real implementation.

---

## Common Design (Both Stacks)

Implement these modules first:

1. `orchestrator` (queue + arbiter + watchdog)
2. `isolation` (workspace create/status/remove/merge abstractions)
3. `workers` (spawn/status/result/wait/stop)
4. `providers` (Gemini, Copilot/OpenAI, others via adapter interface)
5. `state` (task/worker/isolation persistence)
6. `policy` (validation, permissions, audit)

---

## Python Starter Template

### Suggested Structure

```text
swarm_py/
  app/
    api/
      routes_tasks.py
      routes_workers.py
      routes_swarm.py
    core/
      models.py
      enums.py
      scheduler.py
      arbiter.py
      watchdog.py
      isolation.py
      worker_runtime.py
    providers/
      base.py
      gemini_adapter.py
      copilot_openai_adapter.py
    state/
      repository.py
      memory_repo.py
    policy/
      validators.py
      permissions.py
      audit.py
    main.py
  tests/
    test_scheduler.py
    test_arbiter.py
    test_provider_contract.py
```

### Core Enums and Models (`app/core/enums.py`, `app/core/models.py`)

```python
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class WorkerStatus(str, Enum):
    PENDING = "pending"
    STARTING = "starting"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


@dataclass
class Task:
    id: str
    title: str
    description: str
    priority: int = 3
    status: TaskStatus = TaskStatus.PENDING
    dependencies: list[str] = field(default_factory=list)
    blocked_by: list[str] = field(default_factory=list)
    assigned_agent: str | None = None
    isolation_id: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    started_at: str | None = None
    completed_at: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class Worker:
    id: str
    task_id: str
    provider: str
    model_id: str
    status: WorkerStatus = WorkerStatus.PENDING
    runtime_id: str | None = None
    result: str | None = None
    error: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    started_at: str | None = None
    completed_at: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
```

### Provider Adapter Contract (`app/providers/base.py`)

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Any


@dataclass
class GenerationRequest:
    system_prompt: str
    user_prompt: str
    model_id: str
    max_tokens: int = 2048
    temperature: float = 0.2
    timeout_seconds: int = 120
    metadata: dict[str, Any] | None = None


@dataclass
class GenerationResponse:
    text: str
    provider: str
    model_id: str
    finish_reason: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    raw: dict[str, Any] | None = None


class LLMProviderAdapter(Protocol):
    name: str

    async def generate(self, request: GenerationRequest) -> GenerationResponse:
        ...

    async def healthcheck(self) -> bool:
        ...
```

### Gemini Adapter Skeleton (`app/providers/gemini_adapter.py`)

```python
from __future__ import annotations

from app.providers.base import GenerationRequest, GenerationResponse, LLMProviderAdapter


class GeminiAdapter(LLMProviderAdapter):
    name = "gemini"

    async def generate(self, request: GenerationRequest) -> GenerationResponse:
        # TODO: call Gemini SDK/API
        text = f"[stub-gemini] {request.user_prompt[:120]}"
        return GenerationResponse(text=text, provider=self.name, model_id=request.model_id)

    async def healthcheck(self) -> bool:
        return True
```

### Copilot/OpenAI Adapter Skeleton (`app/providers/copilot_openai_adapter.py`)

```python
from __future__ import annotations

from app.providers.base import GenerationRequest, GenerationResponse, LLMProviderAdapter


class CopilotOpenAIAdapter(LLMProviderAdapter):
    name = "copilot_openai"

    async def generate(self, request: GenerationRequest) -> GenerationResponse:
        # TODO: call OpenAI/Azure OpenAI/GitHub Copilot-backed endpoint
        text = f"[stub-copilot] {request.user_prompt[:120]}"
        return GenerationResponse(text=text, provider=self.name, model_id=request.model_id)

    async def healthcheck(self) -> bool:
        return True
```

### Arbiter and Scheduler Skeleton (`app/core/arbiter.py`, `app/core/scheduler.py`)

```python
from __future__ import annotations

from app.core.models import Task
from app.core.enums import TaskStatus


def get_next_available_task(tasks: list[Task]) -> Task | None:
    completed = {t.id for t in tasks if t.status == TaskStatus.COMPLETED}
    candidates: list[Task] = []

    for task in tasks:
        if task.status != TaskStatus.PENDING:
            continue
        if all(dep in completed for dep in task.dependencies):
            candidates.append(task)

    if not candidates:
        return None

    candidates.sort(key=lambda t: (t.priority, t.created_at))
    return candidates[0]
```

### Worker Runtime Skeleton (`app/core/worker_runtime.py`)

```python
from __future__ import annotations

from app.providers.base import GenerationRequest


class WorkerRuntime:
    def __init__(self, providers: dict[str, object], default_provider: str):
        self.providers = providers
        self.default_provider = default_provider

    async def run_task(self, prompt: str, provider: str | None, model_id: str) -> str:
        selected = provider or self.default_provider
        adapter = self.providers[selected]
        req = GenerationRequest(system_prompt="You are a worker", user_prompt=prompt, model_id=model_id)
        resp = await adapter.generate(req)
        return resp.text
```

### FastAPI Entry (`app/main.py`)

```python
from fastapi import FastAPI

app = FastAPI(title="Swarm Orchestrator")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

---

## TypeScript Starter Template

### Suggested Structure

```text
swarm_ts/
  src/
    api/
      tasks.ts
      workers.ts
      swarm.ts
    core/
      enums.ts
      models.ts
      arbiter.ts
      scheduler.ts
      watchdog.ts
      isolation.ts
      workerRuntime.ts
    providers/
      base.ts
      geminiAdapter.ts
      copilotOpenaiAdapter.ts
    state/
      repository.ts
      memoryRepo.ts
    policy/
      validators.ts
      permissions.ts
      audit.ts
    index.ts
  test/
    arbiter.test.ts
    providerContract.test.ts
```

### Enums and Models (`src/core/enums.ts`, `src/core/models.ts`)

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
```

### Provider Adapter Contract (`src/providers/base.ts`)

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

### Gemini Adapter (`src/providers/geminiAdapter.ts`)

```ts
import { GenerationRequest, GenerationResponse, LLMProviderAdapter } from "./base";

export class GeminiAdapter implements LLMProviderAdapter {
  readonly name = "gemini";

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const text = `[stub-gemini] ${request.userPrompt.slice(0, 120)}`;
    return { text, provider: this.name, modelId: request.modelId };
  }

  async healthcheck(): Promise<boolean> {
    return true;
  }
}
```

### Copilot/OpenAI Adapter (`src/providers/copilotOpenaiAdapter.ts`)

```ts
import { GenerationRequest, GenerationResponse, LLMProviderAdapter } from "./base";

export class CopilotOpenaiAdapter implements LLMProviderAdapter {
  readonly name = "copilot_openai";

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const text = `[stub-copilot] ${request.userPrompt.slice(0, 120)}`;
    return { text, provider: this.name, modelId: request.modelId };
  }

  async healthcheck(): Promise<boolean> {
    return true;
  }
}
```

### Arbiter (`src/core/arbiter.ts`)

```ts
import { Task, TaskStatus } from "./models";

export function nextAvailableTask(tasks: Task[]): Task | undefined {
  const completed = new Set(tasks.filter(t => t.status === TaskStatus.Completed).map(t => t.id));

  const candidates = tasks
    .filter(t => t.status === TaskStatus.Pending)
    .filter(t => t.dependencies.every(dep => completed.has(dep)))
    .sort((a, b) => (a.priority - b.priority) || a.createdAt.localeCompare(b.createdAt));

  return candidates[0];
}
```

### Worker Runtime (`src/core/workerRuntime.ts`)

```ts
import { GenerationRequest, LLMProviderAdapter } from "../providers/base";

export class WorkerRuntime {
  constructor(
    private readonly providers: Record<string, LLMProviderAdapter>,
    private readonly defaultProvider: string,
  ) {}

  async runTask(prompt: string, modelId: string, provider?: string): Promise<string> {
    const selected = provider ?? this.defaultProvider;
    const adapter = this.providers[selected];
    if (!adapter) throw new Error(`Unknown provider: ${selected}`);

    const request: GenerationRequest = {
      systemPrompt: "You are a worker",
      userPrompt: prompt,
      modelId,
    };

    const response = await adapter.generate(request);
    return response.text;
  }
}
```

### Express Entry (`src/index.ts`)

```ts
import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(8080, () => {
  console.log("swarm orchestrator listening on 8080");
});
```

---

## Shared Provider Configuration Example

Use one provider config shape across both stacks:

```yaml
default_provider: gemini
providers:
  gemini:
    enabled: true
    default_model: gemini-2.5-pro
    auth_mode: api_key
    endpoint: https://generativelanguage.googleapis.com
  copilot_openai:
    enabled: true
    default_model: gpt-4.1
    auth_mode: oauth
    endpoint: https://api.openai.com
fallback_order:
  - gemini
  - copilot_openai
limits:
  max_workers: 5
  max_task_chars: 50000
  worker_timeout_minutes: 30
```

---

## Minimal Contract Tests (Both Stacks)

Every provider adapter must pass these tests:

1. `generate` returns non-empty `text` for valid request.
2. `generate` returns `provider` and `model_id`.
3. timeout handling returns deterministic error type.
4. auth failure returns deterministic error type.
5. malformed response from SDK is handled (no crash in orchestrator).
6. `healthcheck` returns false on network/auth failure.

And orchestrator tests:

1. dependency-blocked tasks are not assigned.
2. priority sorting picks lower priority number first.
3. stale `in_progress` tasks are requeued.
4. worker capacity limits are enforced.
5. fallback provider is used when preferred provider unavailable.

---

## Practical Rollout Sequence

1. Run the Python or TypeScript scaffold with in-memory state only.
2. Add one provider adapter (Gemini or Copilot/OpenAI).
3. Add second provider adapter and fallback.
4. Replace in-memory state with durable storage.
5. Add real isolation manager (git worktree/containerized workspace).
6. Add policy and audit controls.
7. Add CI checks and contract tests.

---

## Notes for Gemini and Copilot Projects

- Gemini-first projects: implement `GeminiAdapter` first; keep provider interface unchanged.
- Copilot-heavy projects: implement `CopilotOpenAIAdapter` first; keep provider interface unchanged.
- Mixed projects: keep fallback list explicit and audited.
- Never bind queue/arbiter logic to provider-specific token or SDK assumptions.
