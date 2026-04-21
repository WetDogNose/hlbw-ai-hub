// Cloud Run Job dispatcher — for deployments where the UI runs on Cloud Run
// (a sandboxed container that cannot spawn sibling Docker processes) but the
// swarm data plane runs as a Cloud Run Job (one execution per claimed Issue).
//
// The Job resource is created by cloudbuild.yaml (see the `Create/update
// Cloud Run Job` step) and named by env var `SWARM_WORKER_JOB_NAME`, with its
// region in `SWARM_WORKER_JOB_REGION` (default `asia-southeast1` per
// CLAUDE.md's regional directive) and GCP project in `GOOGLE_CLOUD_PROJECT`
// (injected automatically by Cloud Run's metadata server — we also accept
// the explicit `GCP_PROJECT_ID` override for local testing).
//
// Each `launch()` call fires `runJob` with a container-override that injects
// the task's identifiers as env vars. The Job's entrypoint is
// `scripts/swarm/agent-runner.ts`, which reads those env vars and runs the
// graph until completion.
//
// Errors are surfaced to the caller so `dispatcher.ts` can roll the claimed
// Issue back to `pending`. We do NOT await the Operation's completion — the
// Job runs asynchronously, logging to Cloud Logging; the UI surface sees
// progress via TaskGraphState transitions from the Job's DB writes.

import { JobsClient } from "@google-cloud/run";
import type {
  WorkerDispatcher,
  WorkerLaunchRequest,
  WorkerLaunchResult,
} from "./types";

interface CloudRunJobDispatcherOptions {
  /** Test-only: inject a mocked client to avoid touching GCP in unit tests. */
  clientOverride?: Pick<JobsClient, "runJob">;
  /** Test-only: override the resolved region/job-name/project. */
  envOverride?: {
    project?: string;
    region?: string;
    jobName?: string;
  };
}

function resolveEnv(opts?: CloudRunJobDispatcherOptions["envOverride"]): {
  project: string;
  region: string;
  jobName: string;
} {
  const project =
    opts?.project ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCP_PROJECT_ID ??
    "";
  const region =
    opts?.region ?? process.env.SWARM_WORKER_JOB_REGION ?? "asia-southeast1";
  const jobName =
    opts?.jobName ?? process.env.SWARM_WORKER_JOB_NAME ?? "hlbw-swarm-worker";
  return { project, region, jobName };
}

export class CloudRunJobDispatcher implements WorkerDispatcher {
  readonly mode = "cloud-run-job" as const;

  private readonly client: Pick<JobsClient, "runJob">;
  private readonly env: {
    project: string;
    region: string;
    jobName: string;
  };

  constructor(options: CloudRunJobDispatcherOptions = {}) {
    this.env = resolveEnv(options.envOverride);
    this.client = options.clientOverride ?? new JobsClient();
  }

  async launch(req: WorkerLaunchRequest): Promise<WorkerLaunchResult> {
    const { project, region, jobName } = this.env;
    if (!project) {
      throw new Error(
        "CloudRunJobDispatcher: GOOGLE_CLOUD_PROJECT (or GCP_PROJECT_ID) is unset — cannot construct Job resource name.",
      );
    }

    const name = `projects/${project}/locations/${region}/jobs/${jobName}`;

    // Override the Job's container env so a single static Job resource can
    // dispatch different Issues. Keys mirror the contract `agent-runner.ts`
    // already consumes (`AGENT_ISSUE_ID`, `AGENT_CATEGORY`, etc.).
    const envPairs: Array<{ name: string; value: string }> = [
      { name: "AGENT_ISSUE_ID", value: req.taskId },
      { name: "AGENT_INSTRUCTION", value: req.instruction },
      { name: "AGENT_BRANCH_NAME", value: req.branchName },
      { name: "AGENT_CATEGORY", value: req.agentCategory },
      // Set by the Job so the runtime knows it's on the Jobs data plane, not
      // a local detached subprocess.
      { name: "SWARM_RUNTIME", value: "cloud-run-job" },
    ];

    try {
      const [operation] = await this.client.runJob({
        name,
        overrides: {
          containerOverrides: [
            {
              env: envPairs,
            },
          ],
        },
      });
      // Cloud Run returns a long-running operation; we use its name as a
      // correlation id. We intentionally do NOT `await operation.promise()`
      // — the Job is fire-and-forget from the dispatcher's perspective.
      const opName =
        typeof (operation as { name?: unknown }).name === "string"
          ? ((operation as { name: string }).name ?? "pending")
          : "pending";
      return { workerId: `cloud-run-job:${jobName}:${req.taskId}:${opName}` };
    } catch (err: unknown) {
      // Re-throw with context so dispatcher.ts rolls the Issue back and the
      // heartbeat response includes a useful error. Preserve the original
      // Error via `cause` so logs can surface the underlying stack.
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `CloudRunJobDispatcher.runJob failed (${name}): ${msg}`,
        err instanceof Error ? { cause: err } : undefined,
      );
    }
  }
}
