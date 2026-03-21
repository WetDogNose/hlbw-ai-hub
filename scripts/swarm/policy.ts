// Swarm Policy Configuration
// Controls capacity, retention, and operational limits.

export const SWARM_POLICY = {
  /** Maximum number of active workers at any time */
  maxActiveWorkers: 8,

  /** Maximum number of active isolation units (worktrees) at any time */
  maxActiveIsolation: 15,

  /** Maximum character length for a task description/instruction payload */
  maxTaskChars: 100_000,

  /** Worker timeout in minutes before watchdog marks stale */
  workerTimeoutMinutes: 30,

  /** Number of days to retain completed task/worker records before cleanup */
  retentionDays: 5,

  /** Maximum number of recent worker records to keep after cleanup */
  maxRetainedWorkerRecords: 100,

  /** Default provider for new workers */
  defaultProvider: "gemini",

  /** Default model for new workers */
  defaultModel: "gemini-2.5-flash",
};
