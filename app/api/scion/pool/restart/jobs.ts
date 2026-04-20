// Pass 22 — in-memory job map shared by POST /pool/restart and GET
// /pool/restart/[jobId]. Lives inside the Next.js process.
//
// Restart jobs are not durable across process restart by design: the
// pool-manager script runs in a child process; if the Next.js server is
// recycled mid-run, the child is still a detached process and finishes on
// its own. The dashboard loses visibility — operators re-run the action.

export interface PoolRestartJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  finishedAt?: string;
  exitCode?: number | null;
  error?: string;
  stdoutTail?: string;
}

// Export the map directly so the GET route reads the same reference the POST
// writes. A WeakMap doesn't help here — we need enumeration + string keys.
export const poolRestartJobs: Map<string, PoolRestartJob> = new Map();

export function newJobId(): string {
  // Small random hex id — not security-sensitive.
  return `pool-restart-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
