import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { CloudRunJobDispatcher } from "@/lib/orchestration/dispatchers/CloudRunJobDispatcher";
import type { JobsClient } from "@google-cloud/run";

// Unit tests for CloudRunJobDispatcher. We inject a mocked `runJob` so no
// GCP credentials or network calls are involved. The dispatcher only needs
// the first tuple element (the LRO with `.name`); the other two tuple slots
// are unused at call time, so we satisfy TypeScript by casting through
// `unknown` where the concrete LRO types aren't what the adapter exercises.

// The @google-cloud/run runJob resolves to [LROperation, IOperation | undefined, {} | undefined].
// For adapter-level tests only the `.name` on the first slot matters — we
// widen via `unknown` to keep the mock shapes tiny.
type RunJobMethod = JobsClient["runJob"];

function makeRunJobMock(returnName: string | undefined): {
  runJob: RunJobMethod;
  inspect: () => { firstCallRequest: unknown; calls: number };
} {
  const calls: unknown[][] = [];
  const impl = async (...args: unknown[]) => {
    calls.push(args);
    const op = returnName !== undefined ? { name: returnName } : {};
    return [op, undefined, undefined] as unknown as Awaited<
      ReturnType<RunJobMethod>
    >;
  };
  return {
    runJob: impl as unknown as RunJobMethod,
    inspect: () => ({
      firstCallRequest: calls[0]?.[0],
      calls: calls.length,
    }),
  };
}

function makeRunJobErrorMock(err: Error): {
  runJob: RunJobMethod;
} {
  const impl = async () => {
    throw err;
  };
  return { runJob: impl as unknown as RunJobMethod };
}

describe("CloudRunJobDispatcher", () => {
  const req = {
    taskId: "issue-123",
    instruction: "do a thing",
    branchName: "issue/issue-123",
    agentCategory: "1_qa",
  };

  const envOverride = {
    project: "test-project",
    region: "asia-southeast1",
    jobName: "hlbw-swarm-worker",
  };

  let originalProject: string | undefined;
  let originalRegion: string | undefined;
  let originalJob: string | undefined;
  let originalAlt: string | undefined;

  beforeEach(() => {
    originalProject = process.env.GOOGLE_CLOUD_PROJECT;
    originalRegion = process.env.SWARM_WORKER_JOB_REGION;
    originalJob = process.env.SWARM_WORKER_JOB_NAME;
    originalAlt = process.env.GCP_PROJECT_ID;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCP_PROJECT_ID;
    delete process.env.SWARM_WORKER_JOB_REGION;
    delete process.env.SWARM_WORKER_JOB_NAME;
  });

  afterEach(() => {
    if (originalProject) process.env.GOOGLE_CLOUD_PROJECT = originalProject;
    if (originalRegion) process.env.SWARM_WORKER_JOB_REGION = originalRegion;
    if (originalJob) process.env.SWARM_WORKER_JOB_NAME = originalJob;
    if (originalAlt) process.env.GCP_PROJECT_ID = originalAlt;
  });

  it('reports mode === "cloud-run-job"', () => {
    const { runJob } = makeRunJobMock(undefined);
    const d = new CloudRunJobDispatcher({
      clientOverride: { runJob },
      envOverride,
    });
    expect(d.mode).toBe("cloud-run-job");
  });

  it("throws with a clear error when GOOGLE_CLOUD_PROJECT is unset", async () => {
    const { runJob } = makeRunJobMock(undefined);
    const d = new CloudRunJobDispatcher({
      clientOverride: { runJob },
      envOverride: { ...envOverride, project: "" },
    });
    await expect(d.launch(req)).rejects.toThrow(/GOOGLE_CLOUD_PROJECT/);
  });

  it("calls runJob with the fully-qualified Job resource name and per-task env overrides", async () => {
    const { runJob, inspect } = makeRunJobMock("operations/op-42");
    const d = new CloudRunJobDispatcher({
      clientOverride: { runJob },
      envOverride,
    });

    const result = await d.launch(req);

    const { firstCallRequest, calls } = inspect();
    expect(calls).toBe(1);
    const args = firstCallRequest as {
      name: string;
      overrides: {
        containerOverrides: Array<{
          env: Array<{ name: string; value: string }>;
        }>;
      };
    };
    expect(args.name).toBe(
      "projects/test-project/locations/asia-southeast1/jobs/hlbw-swarm-worker",
    );
    const envPairs = args.overrides.containerOverrides[0].env;
    expect(envPairs).toEqual(
      expect.arrayContaining([
        { name: "AGENT_ISSUE_ID", value: "issue-123" },
        { name: "AGENT_INSTRUCTION", value: "do a thing" },
        { name: "AGENT_BRANCH_NAME", value: "issue/issue-123" },
        { name: "AGENT_CATEGORY", value: "1_qa" },
        { name: "SWARM_RUNTIME", value: "cloud-run-job" },
      ]),
    );
    expect(result.workerId).toBe(
      "cloud-run-job:hlbw-swarm-worker:issue-123:operations/op-42",
    );
  });

  it("handles a missing operation name gracefully (workerId still populated)", async () => {
    const { runJob } = makeRunJobMock(undefined);
    const d = new CloudRunJobDispatcher({
      clientOverride: { runJob },
      envOverride,
    });
    const result = await d.launch(req);
    expect(result.workerId).toContain("hlbw-swarm-worker:issue-123:pending");
  });

  it("propagates runJob failures with context-enriched message", async () => {
    const { runJob } = makeRunJobErrorMock(new Error("PERMISSION_DENIED"));
    const d = new CloudRunJobDispatcher({
      clientOverride: { runJob },
      envOverride,
    });
    await expect(d.launch(req)).rejects.toThrow(
      /CloudRunJobDispatcher\.runJob failed.*PERMISSION_DENIED/,
    );
  });

  it("falls back to env vars when envOverride is not supplied", async () => {
    process.env.GOOGLE_CLOUD_PROJECT = "env-project";
    process.env.SWARM_WORKER_JOB_REGION = "asia-southeast1";
    process.env.SWARM_WORKER_JOB_NAME = "env-job";
    const { runJob, inspect } = makeRunJobMock("op");
    const d = new CloudRunJobDispatcher({ clientOverride: { runJob } });
    await d.launch(req);
    const args = inspect().firstCallRequest as { name: string };
    expect(args.name).toBe(
      "projects/env-project/locations/asia-southeast1/jobs/env-job",
    );
  });
});
