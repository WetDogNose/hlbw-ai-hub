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
