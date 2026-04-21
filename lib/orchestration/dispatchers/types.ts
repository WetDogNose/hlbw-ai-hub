// Dispatcher adapter contract.
//
// The swarm's only Docker-specific assumption lives in how we launch a
// worker per claimed Issue. This interface isolates that seam so each
// deployment environment can plug in its own launcher without touching the
// orchestrator's claim-and-retry logic in `lib/orchestration/dispatcher.ts`.

export type DispatcherMode = "docker" | "noop" | "cloud-run-job";

export interface WorkerLaunchRequest {
  taskId: string;
  instruction: string;
  branchName: string;
  agentCategory: string;
}

export interface WorkerLaunchResult {
  workerId: string;
}

export interface WorkerDispatcher {
  /** Identifier surfaced to the UI and `/api/scion/engine-health`. */
  readonly mode: DispatcherMode;
  /**
   * Launch a worker for a claimed Issue. Throw to signal failure; the caller
   * rolls the Issue back to `pending` so a future heartbeat retries it.
   */
  launch(req: WorkerLaunchRequest): Promise<WorkerLaunchResult>;
}

export class DispatcherUnavailableError extends Error {
  constructor(mode: DispatcherMode, detail?: string) {
    super(
      `Dispatcher mode "${mode}" cannot launch workers in this environment${
        detail ? `: ${detail}` : ""
      }`,
    );
    this.name = "DispatcherUnavailableError";
  }
}
