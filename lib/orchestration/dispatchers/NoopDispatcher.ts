// No-op dispatcher — for environments that host only the SCION operator UI
// (e.g. Cloud Run) and delegate the actual swarm execution to a separate
// data-plane host with Docker. `launch` always throws so the orchestrator
// rolls the claimed Issue back to `pending` if anything accidentally
// invokes this dispatcher.
//
// `dispatchReadyIssues` checks `dispatcher.mode === "noop"` before claiming
// an Issue, so in practice the happy path never reaches `launch`.

import {
  DispatcherUnavailableError,
  type WorkerDispatcher,
  type WorkerLaunchRequest,
  type WorkerLaunchResult,
} from "./types";

export class NoopDispatcher implements WorkerDispatcher {
  readonly mode = "noop" as const;

  async launch(_req: WorkerLaunchRequest): Promise<WorkerLaunchResult> {
    throw new DispatcherUnavailableError(
      "noop",
      "No worker data plane is wired to this deployment.",
    );
  }
}
