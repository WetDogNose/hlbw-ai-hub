import fs from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";
import crypto from "node:crypto";
import { SwarmState, Task, TaskStatus, Worker, WorkerStatus } from "./types";
import { SWARM_POLICY } from "./policy";
import { appendAudit } from "./audit";

const DB_DIR = path.join(process.cwd(), ".agents", "swarm");
const DB_PATH = path.join(DB_DIR, "state.json");

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
 * Executes a function with an exclusive lock on the state db.
 * Handles the read-modify-write cycle atomically to prevent race conditions.
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
      // Use robust retries for highly concurrent swarms
      release = await lockfile.lock(DB_PATH, {
        retries: {
          retries: 50, // Retry many times under high load
          factor: 1.2, // Exponential backoff
          minTimeout: 50, // Fast retry interval
          maxTimeout: 1000, // Max delay
          randomize: true, // Jitter spreads out stampedes
        },
        stale: 10000, // Increase stale check to 10s for heavy IO
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
export async function getState(): Promise<SwarmState> {
  await ensureDbExists();
  try {
    const data = await fs.readFile(DB_PATH, "utf-8");
    return JSON.parse(data) as SwarmState;
  } catch (err) {
    // If we hit a race during write, return empty or wait slightly
    await new Promise((r) => setTimeout(r, 100));
    const data = await fs.readFile(DB_PATH, "utf-8");
    return JSON.parse(data) as SwarmState;
  }
}

export async function saveState(state: SwarmState): Promise<void> {
  // Provided for backwards compatibility where users call saveState manually
  // Using withStateLock is strongly preferred
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

// --- Gap 4: Full Backlog API ---

export async function addTask(
  task: Omit<Task, "id" | "status" | "createdAt" | "blockedBy">,
): Promise<Task> {
  // Gap 5: task size limit
  if (task.description && task.description.length > SWARM_POLICY.maxTaskChars) {
    throw new Error(
      `Task description exceeds ${SWARM_POLICY.maxTaskChars} character limit.`,
    );
  }

  return await withStateLock(async (state) => {
    const newTask: Task = {
      ...task,
      id: `task-${crypto.randomUUID()}`,
      status: TaskStatus.Pending,
      blockedBy: [],
      createdAt: new Date().toISOString(),
      metadata: task.metadata || {},
      dependencies: task.dependencies || [],
    };
    state.tasks.push(newTask);
    await appendAudit({
      actor: "master-agent",
      action: "task.created",
      entityType: "task",
      entityId: newTask.id,
      newState: newTask.status,
    });
    return newTask;
  });
}

export async function listTasks(filter?: {
  status?: TaskStatus;
}): Promise<Task[]> {
  const state = await getState();
  if (filter?.status) {
    return state.tasks.filter((t) => t.status === filter.status);
  }
  return state.tasks;
}

export async function assignTask(
  taskId: string,
  agentId: string,
): Promise<Task | null> {
  return await withStateLock(async (state) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    const prev = task.status;
    task.assignedAgent = agentId;
    task.status = TaskStatus.InProgress;
    task.startedAt = new Date().toISOString();
    await appendAudit({
      actor: agentId,
      action: "task.assigned",
      entityType: "task",
      entityId: taskId,
      previousState: prev,
      newState: task.status,
    });
    return task;
  });
}

export async function completeTask(
  taskId: string,
  result?: string,
): Promise<Task | null> {
  return await withStateLock(async (state) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    const prev = task.status;
    task.status = TaskStatus.Completed;
    task.completedAt = new Date().toISOString();
    if (result) task.metadata.result = result;
    await appendAudit({
      actor: "master-agent",
      action: "task.completed",
      entityType: "task",
      entityId: taskId,
      previousState: prev,
      newState: task.status,
    });
    return task;
  });
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  actor = "system",
): Promise<Task | null> {
  return await withStateLock(async (state) => {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return null;

    const prev = task.status;
    task.status = status;
    if (status === TaskStatus.InProgress) {
      task.startedAt = new Date().toISOString();
    } else if (
      status === TaskStatus.Completed ||
      status === TaskStatus.Failed ||
      status === TaskStatus.Cancelled
    ) {
      task.completedAt = new Date().toISOString();
    }

    await appendAudit({
      actor,
      action: "task.status_changed",
      entityType: "task",
      entityId: id,
      previousState: prev,
      newState: status,
    });
    return task;
  });
}

export async function getPendingTasks(): Promise<Task[]> {
  const state = await getState();
  return state.tasks.filter((t) => t.status === TaskStatus.Pending);
}

// --- Worker APIs (Gap 2) ---

export async function addWorker(
  worker: Omit<Worker, "id" | "createdAt">,
): Promise<Worker> {
  return await withStateLock(async (state) => {
    // Gap 5: capacity enforcement
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
  const state = await getState();
  return state.workers.find((w) => w.id === workerId) || null;
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
  const state = await getState();
  if (filter?.status) {
    return state.workers.filter((w) => w.status === filter.status);
  }
  return state.workers;
}

// --- Gap 9: Retention Cleanup ---

export async function cleanupRetention(): Promise<{
  removedTasks: number;
  removedWorkers: number;
}> {
  return await withStateLock(async (state) => {
    const now = Date.now();
    const retentionMs = SWARM_POLICY.retentionDays * 24 * 60 * 60 * 1000;
    const terminalStatuses = new Set([
      TaskStatus.Completed,
      TaskStatus.Failed,
      TaskStatus.Cancelled,
    ]);
    const workerTerminal = new Set([
      WorkerStatus.Completed,
      WorkerStatus.Failed,
      WorkerStatus.Timeout,
      WorkerStatus.Cancelled,
    ]);

    const originalTaskCount = state.tasks.length;
    const originalWorkerCount = state.workers.length;

    // Remove old completed tasks
    state.tasks = state.tasks.filter((t) => {
      if (terminalStatuses.has(t.status) && t.completedAt) {
        return now - new Date(t.completedAt).getTime() < retentionMs;
      }
      return true;
    });

    // Remove old completed workers, keep max retained
    state.workers = state.workers.filter((w) => {
      if (workerTerminal.has(w.status) && w.completedAt) {
        return now - new Date(w.completedAt).getTime() < retentionMs;
      }
      return true;
    });

    // Enforce max retained worker records
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

    const removedTasks = originalTaskCount - state.tasks.length;
    const removedWorkers = originalWorkerCount - state.workers.length;

    if (removedTasks > 0 || removedWorkers > 0) {
      await appendAudit({
        actor: "cleanup",
        action: "retention.cleanup",
        entityType: "state",
        entityId: "global",
        metadata: { removedTasks, removedWorkers },
      });
    }

    return { removedTasks, removedWorkers };
  });
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
