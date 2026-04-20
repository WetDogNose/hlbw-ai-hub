export enum TaskStatus {
  Pending = "pending",
  InProgress = "in_progress",
  Blocked = "blocked",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled",
  // Pass 12 — terminal-for-automation state set when the Actor/Critic loop
  // exhausts maxReworkCycles without producing an approved proposal. A
  // human operator must intervene (see docs/re-arch/pass-12-result.md).
  NeedsHuman = "needs_human",
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

// ---------------------------------------------------------------------------
// Pass 4 adapter: Issue (Prisma) <-> Task (in-memory DTO)
// ---------------------------------------------------------------------------
// Rationale: Postgres `Issue` is the source of truth. The swarm's JSON state
// file becomes a read-through cache (Pass 5). Swarm runtime code still speaks
// `Task`; this adapter is the single translation point.
//
// `import type` keeps this file zero-runtime-dependency on the generated
// Prisma client; the swarm can still run before the migration is applied.
import type { Issue, Prisma } from "@prisma/client";

type IssueMetadata = Record<string, unknown>;

function parseIssueMetadata(value: Issue["metadata"]): IssueMetadata {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as IssueMetadata;
  }
  return {};
}

function normalizeStatus(raw: string): TaskStatus {
  switch (raw) {
    case TaskStatus.Pending:
    case TaskStatus.InProgress:
    case TaskStatus.Blocked:
    case TaskStatus.Completed:
    case TaskStatus.Failed:
    case TaskStatus.Cancelled:
    case TaskStatus.NeedsHuman:
      return raw as TaskStatus;
    default:
      return TaskStatus.Pending;
  }
}

export function toTask(issue: Issue): Task {
  return {
    id: issue.id,
    title: issue.title ?? issue.instruction,
    description: issue.instruction,
    priority: issue.priority,
    status: normalizeStatus(issue.status),
    dependencies: [...issue.dependencies],
    blockedBy: [...issue.blockedBy],
    assignedAgent:
      issue.assignedAgentLabel ?? issue.assignedAgentId ?? undefined,
    isolationId: issue.isolationId ?? undefined,
    createdAt: issue.createdAt.toISOString(),
    startedAt: issue.startedAt ? issue.startedAt.toISOString() : undefined,
    completedAt: issue.completedAt
      ? issue.completedAt.toISOString()
      : undefined,
    metadata: parseIssueMetadata(issue.metadata),
  };
}

export interface FromTaskContext {
  threadId: string;
  goalId?: string;
  assignedAgentId?: string;
  agentCategory?: string;
}

export function fromTask(
  task: Omit<Task, "id" | "createdAt">,
  context: FromTaskContext,
): Prisma.IssueCreateInput {
  const input: Prisma.IssueCreateInput = {
    title: task.title,
    instruction: task.description,
    status: task.status,
    priority: task.priority,
    dependencies: { set: [...task.dependencies] },
    blockedBy: { set: [...task.blockedBy] },
    agentCategory: context.agentCategory ?? null,
    isolationId: task.isolationId ?? null,
    assignedAgentLabel: task.assignedAgent ?? null,
    startedAt: task.startedAt ? new Date(task.startedAt) : null,
    completedAt: task.completedAt ? new Date(task.completedAt) : null,
    metadata: task.metadata as Prisma.InputJsonValue,
    thread: { connect: { id: context.threadId } },
  };
  if (context.goalId) {
    input.goal = { connect: { id: context.goalId } };
  }
  if (context.assignedAgentId) {
    input.assignedAgent = { connect: { id: context.assignedAgentId } };
  }
  return input;
}
