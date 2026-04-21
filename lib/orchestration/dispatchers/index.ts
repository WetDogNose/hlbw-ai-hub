// Dispatcher factory. Selects the adapter by `DISPATCHER_MODE` env var;
// defaults to "docker" so local dev and the existing VM dispatch path stay
// unchanged. Exported as a memoised singleton — `dispatcher.ts` holds the
// claim-and-retry loop; this module owns "which launcher do we use".

import { DockerDispatcher } from "./DockerDispatcher";
import { NoopDispatcher } from "./NoopDispatcher";
import { CloudRunJobDispatcher } from "./CloudRunJobDispatcher";
import type { DispatcherMode, WorkerDispatcher } from "./types";

export type { DispatcherMode, WorkerDispatcher } from "./types";
export {
  DispatcherUnavailableError,
  type WorkerLaunchRequest,
  type WorkerLaunchResult,
} from "./types";
export { spawnWorkerSubprocess } from "./DockerDispatcher";

function buildDispatcher(mode: DispatcherMode): WorkerDispatcher {
  switch (mode) {
    case "docker":
      return new DockerDispatcher();
    case "noop":
      return new NoopDispatcher();
    case "cloud-run-job":
      return new CloudRunJobDispatcher();
  }
}

function resolveMode(): DispatcherMode {
  const raw = process.env.DISPATCHER_MODE?.trim().toLowerCase();
  if (raw === "noop") return "noop";
  if (raw === "cloud-run-job" || raw === "cloud_run_job")
    return "cloud-run-job";
  if (raw === "docker" || !raw) return "docker";
  // Unknown mode: log once and fall back to noop so the UI doesn't claim
  // Issues it can't execute.
  console.warn(
    `[dispatcher] Unknown DISPATCHER_MODE="${raw}". Falling back to "noop".`,
  );
  return "noop";
}

let cached: { key: string; instance: WorkerDispatcher } | null = null;

/**
 * Returns the active dispatcher. Memoised per-process, keyed on the env var
 * value so tests that mutate `process.env.DISPATCHER_MODE` still pick up the
 * change.
 */
export function getDispatcher(): WorkerDispatcher {
  const mode = resolveMode();
  if (cached && cached.key === mode) return cached.instance;
  const instance = buildDispatcher(mode);
  cached = { key: mode, instance };
  return instance;
}

/** Exposed for tests that want to force a fresh resolve. */
export function resetDispatcherCache(): void {
  cached = null;
}
