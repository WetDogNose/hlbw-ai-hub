// Pass 5 — Postgres is the source of truth for Task state.
//
// The JSON file at `.agents/swarm/state.json` is now a best-effort DEBUG
// SNAPSHOT, not the queue. Reads of task data go through Prisma against the
// `Issue` table; writes go through Prisma too. After each write the snapshot
// is refreshed on a best-effort basis so `cat state.json` stays useful for
// operators — a snapshot failure never aborts the write.
//
// Scope note: the `Worker` concept has no Postgres table in the current
// schema (pass 4 only unified `Task`/`Issue`). Worker CRUD therefore still
// lives in the JSON file and its `proper-lockfile` cross-process lock. A
// future pass will introduce a `Worker`/`Agent` model; until then the file
// is authoritative for `workers`, and authoritative for `tasks` only as a
// snapshot behind Postgres.

import fs from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";
import crypto from "node:crypto";
import prisma from "@/lib/prisma";
import { SwarmState, Task, TaskStatus, Worker, WorkerStatus } from "./types";
import { fromTask, toTask } from "./types";
import { SWARM_POLICY } from "./policy";
import { appendAudit } from "./audit";

const DB_DIR = path.join(process.cwd(), ".agents", "swarm");
const DB_PATH = path.join(DB_DIR, "state.json");
const DEFAULT_THREAD_TITLE = "swarm-default";

const DEFAULT_STATE: SwarmState = {
  tasks: [],
  workers: [],
};

async function ensureDbExists() {
  await fs.mkdir(DB_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(
      DB_PATH,
      JSON.stringify(DEFAULT_STATE, null, 2),
      "utf-8",
    );
  }
}

/**
 * Ensures there is a default Thread row and returns its id. The swarm
 * entrypoints (`addTask`) don't carry a conversation thread, so we keep a
 * single long-lived system thread as the anchor.
 */
async function getOrCreateDefaultThreadId(): Promise<string> {
  const existing = await prisma.thread.findFirst({
    where: { title: DEFAULT_THREAD_TITLE },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.thread.create({
    data: { title: DEFAULT_THREAD_TITLE },
    select: { id: true },
  });
  return created.id;
}

/**
 * Executes a function with an exclusive lock on the JSON snapshot file.
 * Retained for Worker CRUD and snapshot refresh — Task CRUD routes through
 * Postgres directly and does not need this lock.
 */
export async function withStateLock<T>(
  fn: (state: SwarmState) => Promise<T> | T,
): Promise<T> {
  await ensureDbExists();

  let release: () => Promise<void> | void = () => {};
  let retryCount = 0;
  const maxRetries = 10;

  while (retryCount < maxRetries) {
    try {
      release = await lockfile.lock(DB_PATH, {
        retries: {
          retries: 50,
          factor: 1.2,
          minTimeout: 50,
          maxTimeout: 1000,
          randomize: true,
        },
        stale: 10000,
      });
      break;
    } catch (err) {
      retryCount++;
      if (retryCount >= maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
    }
  }

  try {
    const data = await fs.readFile(DB_PATH, "utf-8");
    const state = JSON.parse(data) as SwarmState;
    const result = await fn(state);
    await fs.writeFile(DB_PATH, JSON.stringify(state, null, 2), "utf-8");
    return result;
  } finally {
    try {
      await release();
    } catch (e) {}
  }
}

/**
 * Reads the full swarm state.
 *
 * Tasks come from Postgres (source of truth). Workers come from the JSON
 * snapshot since they have no Prisma model yet.
 */
export async function getState(): Promise<SwarmState> {
  const [issues, workerState] = await Promise.all([
    prisma.issue.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 500,
    }),
    readJsonWorkers(),
  ]);
  return {
    tasks: issues.map((i) => toTask(i)),
    workers: workerState,
  };
}

async function readJsonWorkers(): Promise<Worker[]> {
  await ensureDbExists();
  try {
    const data = await fs.readFile(DB_PATH, "utf-8");
    const parsed = JSON.parse(data) as SwarmState;
    return Array.isArray(parsed.workers) ? parsed.workers : [];
  } catch {
    return [];
  }
}

/**
 * Overwrites the JSON snapshot. Back-compat helper; callers should prefer
 * the granular APIs below.
 */
export async function saveState(state: SwarmState): Promise<void> {
  await ensureDbExists();
  const release = await lockfile
    .lock(DB_PATH, {
      retries: {
        retries: 200,
        minTimeout: 50,
        maxTimeout: 2000,
        randomize: true,
      },
    })
    .catch((e) => {
      throw new Error(`Failed to write lock for state.json: ${e.message}`);
    });

  try {
    await fs.writeFile(DB_PATH, JSON.stringify(state, null, 2), "utf-8");
  } finally {
    await release();
  }
}

/**
 * Best-effort refresh of the JSON snapshot from Postgres. Never throws.
 */
async function refreshSnapshotBestEffort(): Promise<void> {
  try {
    const state = await getState();
    await saveState(state);
  } catch (err: any) {
    console.warn(
      `state-manager: snapshot refresh skipped (${err?.message ?? err}).`,
    );
  }
}

// ---------------------------------------------------------------------------
// Task APIs (Postgres-backed)
// ---------------------------------------------------------------------------

export async function addTask(
  task: Omit<Task, "id" | "status" | "createdAt" | "blockedBy">,
): Promise<Task> {
  if (task.description && task.description.length > SWARM_POLICY.maxTaskChars) {
    throw new Error(
      `Task description exceeds ${SWARM_POLICY.maxTaskChars} character limit.`,
    );
  }

  const threadId = await getOrCreateDefaultThreadId();
  const agentCategory =
    typeof task.metadata?.agentType === "string"
      ? (task.metadata.agentType as string)
      : undefined;

  const draft: Omit<Task, "id" | "createdAt"> = {
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: TaskStatus.Pending,
    dependencies: task.dependencies ?? [],
    blockedBy: [],
    assignedAgent: task.assignedAgent,
    isolationId: task.isolationId,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    metadata: task.metadata || {},
  };

  const input = fromTask(draft, { threadId, agentCategory });
  const issue = await prisma.issue.create({ data: input });
  const created = toTask(issue);

  await appendAudit({
    actor: "master-agent",
    action: "task.created",
    entityType: "task",
    entityId: created.id,
    newState: created.status,
  });

  await refreshSnapshotBestEffort();
  return created;
}

export async function listTasks(filter?: {
  status?: TaskStatus;
}): Promise<Task[]> {
  const issues = await prisma.issue.findMany({
    where: filter?.status ? { status: filter.status } : undefined,
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  return issues.map((i) => toTask(i));
}

export async function assignTask(
  taskId: string,
  agentId: string,
): Promise<Task | null> {
  const existing = await prisma.issue.findUnique({ where: { id: taskId } });
  if (!existing) return null;

  const prev = existing.status;
  const updated = await prisma.issue.update({
    where: { id: taskId },
    data: {
      assignedAgentLabel: agentId,
      status: TaskStatus.InProgress,
      startedAt: new Date(),
    },
  });

  await appendAudit({
    actor: agentId,
    action: "task.assigned",
    entityType: "task",
    entityId: taskId,
    previousState: prev,
    newState: updated.status,
  });

  await refreshSnapshotBestEffort();
  return toTask(updated);
}

export async function completeTask(
  taskId: string,
  result?: string,
): Promise<Task | null> {
  const existing = await prisma.issue.findUnique({ where: { id: taskId } });
  if (!existing) return null;

  const prev = existing.status;
  const mergedMetadata: Record<string, unknown> = {
    ...(existing.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {}),
  };
  if (result) mergedMetadata.result = result;

  const updated = await prisma.issue.update({
    where: { id: taskId },
    data: {
      status: TaskStatus.Completed,
      completedAt: new Date(),
      metadata: mergedMetadata as any,
    },
  });

  await appendAudit({
    actor: "master-agent",
    action: "task.completed",
    entityType: "task",
    entityId: taskId,
    previousState: prev,
    newState: updated.status,
  });

  await refreshSnapshotBestEffort();
  return toTask(updated);
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  actor = "system",
): Promise<Task | null> {
  const existing = await prisma.issue.findUnique({ where: { id } });
  if (!existing) return null;

  const prev = existing.status;
  const data: {
    status: TaskStatus;
    startedAt?: Date;
    completedAt?: Date;
  } = { status };
  if (status === TaskStatus.InProgress) {
    data.startedAt = new Date();
  } else if (
    status === TaskStatus.Completed ||
    status === TaskStatus.Failed ||
    status === TaskStatus.Cancelled
  ) {
    data.completedAt = new Date();
  }

  const updated = await prisma.issue.update({
    where: { id },
    data,
  });

  await appendAudit({
    actor,
    action: "task.status_changed",
    entityType: "task",
    entityId: id,
    previousState: prev,
    newState: status,
  });

  await refreshSnapshotBestEffort();
  return toTask(updated);
}

export async function getPendingTasks(): Promise<Task[]> {
  const issues = await prisma.issue.findMany({
    where: { status: TaskStatus.Pending },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  return issues.map((i) => toTask(i));
}

// ---------------------------------------------------------------------------
// Worker APIs (JSON-backed — no Prisma Worker model yet)
// ---------------------------------------------------------------------------

export async function addWorker(
  worker: Omit<Worker, "id" | "createdAt">,
): Promise<Worker> {
  return await withStateLock(async (state) => {
    const activeWorkers = state.workers.filter(
      (w) =>
        w.status === WorkerStatus.Running || w.status === WorkerStatus.Starting,
    );
    if (activeWorkers.length >= SWARM_POLICY.maxActiveWorkers) {
      throw new Error(
        `Capacity exceeded: ${activeWorkers.length}/${SWARM_POLICY.maxActiveWorkers} active workers.`,
      );
    }

    const newWorker: Worker = {
      ...worker,
      id: `worker-${crypto.randomUUID()}`,
      status: worker.status || WorkerStatus.Pending,
      createdAt: new Date().toISOString(),
      metadata: worker.metadata || {},
    };
    state.workers.push(newWorker);
    await appendAudit({
      actor: "docker-worker",
      action: "worker.spawned",
      entityType: "worker",
      entityId: newWorker.id,
      newState: newWorker.status,
      metadata: { taskId: newWorker.taskId },
    });
    return newWorker;
  });
}

export async function getWorkerStatus(
  workerId: string,
): Promise<Worker | null> {
  const workers = await readJsonWorkers();
  return workers.find((w) => w.id === workerId) || null;
}

export async function getWorkerResult(
  workerId: string,
): Promise<{ result?: string; error?: string } | null> {
  const worker = await getWorkerStatus(workerId);
  if (!worker) return null;
  return { result: worker.result, error: worker.error };
}

export async function updateWorkerStatus(
  workerId: string,
  status: WorkerStatus,
  extra?: { result?: string; error?: string; runtimeId?: string },
): Promise<Worker | null> {
  return await withStateLock(async (state) => {
    const worker = state.workers.find((w) => w.id === workerId);
    if (!worker) return null;

    const prev = worker.status;
    worker.status = status;
    if (status === WorkerStatus.Running)
      worker.startedAt = new Date().toISOString();
    if (
      status === WorkerStatus.Completed ||
      status === WorkerStatus.Failed ||
      status === WorkerStatus.Timeout
    ) {
      worker.completedAt = new Date().toISOString();
    }
    if (extra?.result) worker.result = extra.result;
    if (extra?.error) worker.error = extra.error;
    if (extra?.runtimeId) worker.runtimeId = extra.runtimeId;

    await appendAudit({
      actor: "system",
      action: "worker.status_changed",
      entityType: "worker",
      entityId: workerId,
      previousState: prev,
      newState: status,
    });
    return worker;
  });
}

export async function listWorkers(filter?: {
  status?: WorkerStatus;
}): Promise<Worker[]> {
  const workers = await readJsonWorkers();
  if (filter?.status) {
    return workers.filter((w) => w.status === filter.status);
  }
  return workers;
}

// ---------------------------------------------------------------------------
// Retention cleanup
// ---------------------------------------------------------------------------

export async function cleanupRetention(): Promise<{
  removedTasks: number;
  removedWorkers: number;
}> {
  const now = Date.now();
  const retentionMs = SWARM_POLICY.retentionDays * 24 * 60 * 60 * 1000;
  const cutoff = new Date(now - retentionMs);

  // Task cleanup: delete terminal-state Issues older than retention window.
  const taskDelete = await prisma.issue.deleteMany({
    where: {
      status: {
        in: [TaskStatus.Completed, TaskStatus.Failed, TaskStatus.Cancelled],
      },
      completedAt: { lt: cutoff, not: null },
    },
  });
  const removedTasks = taskDelete.count;

  // Worker cleanup: still JSON-backed.
  const removedWorkers = await withStateLock(async (state) => {
    const originalWorkerCount = state.workers.length;
    const workerTerminal = new Set([
      WorkerStatus.Completed,
      WorkerStatus.Failed,
      WorkerStatus.Timeout,
      WorkerStatus.Cancelled,
    ]);

    state.workers = state.workers.filter((w) => {
      if (workerTerminal.has(w.status) && w.completedAt) {
        return now - new Date(w.completedAt).getTime() < retentionMs;
      }
      return true;
    });

    if (state.workers.length > SWARM_POLICY.maxRetainedWorkerRecords) {
      const terminal = state.workers.filter((w) =>
        workerTerminal.has(w.status),
      );
      const active = state.workers.filter((w) => !workerTerminal.has(w.status));
      terminal.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const keep = terminal.slice(
        -(SWARM_POLICY.maxRetainedWorkerRecords - active.length),
      );
      state.workers = [...active, ...keep];
    }

    return originalWorkerCount - state.workers.length;
  });

  if (removedTasks > 0 || removedWorkers > 0) {
    await appendAudit({
      actor: "cleanup",
      action: "retention.cleanup",
      entityType: "state",
      entityId: "global",
      metadata: { removedTasks, removedWorkers },
    });
  }

  await refreshSnapshotBestEffort();
  return { removedTasks, removedWorkers };
}

// CLI usage
if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === "list") {
    const statusFilter = process.argv[3] as TaskStatus | undefined;
    listTasks(statusFilter ? { status: statusFilter } : undefined).then(
      (tasks) => {
        console.log(JSON.stringify(tasks, null, 2));
      },
    );
  } else if (cmd === "complete") {
    const taskId = process.argv[3];
    if (taskId)
      completeTask(taskId).then((t) =>
        console.log(t ? `Completed: ${t.id}` : "Not found"),
      );
  } else if (cmd === "cleanup") {
    cleanupRetention().then((r) =>
      console.log(
        `Cleaned up ${r.removedTasks} tasks, ${r.removedWorkers} workers.`,
      ),
    );
  } else {
    console.log(
      "Usage: tsx state-manager.ts [list [status] | complete <taskId> | cleanup]",
    );
  }
}
