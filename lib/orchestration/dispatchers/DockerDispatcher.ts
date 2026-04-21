// Docker dispatcher — the original behaviour extracted from dispatcher.ts.
//
// Spawns `npx tsx scripts/swarm/docker-worker.ts ...` as a detached child
// process. The subprocess performs the actual `docker exec` inside a warm
// pool container. Requires a Docker daemon on the host running this code.

import { spawn } from "node:child_process";
import path from "node:path";
import type {
  WorkerDispatcher,
  WorkerLaunchRequest,
  WorkerLaunchResult,
} from "./types";

export class DockerDispatcher implements WorkerDispatcher {
  readonly mode = "docker" as const;

  async launch(req: WorkerLaunchRequest): Promise<WorkerLaunchResult> {
    return spawnWorkerSubprocess(
      req.taskId,
      req.instruction,
      req.branchName,
      req.agentCategory,
    );
  }
}

/**
 * Exported so existing tests can `jest.mock` this seam without replacing the
 * dispatcher adapter itself. Production path forks
 * `npx tsx scripts/swarm/docker-worker.ts` as a detached child.
 */
export async function spawnWorkerSubprocess(
  taskId: string,
  instruction: string,
  branchName: string,
  agentCategory: string,
): Promise<WorkerLaunchResult> {
  const repoRoot = process.cwd();
  const scriptPath = path.join(
    repoRoot,
    "scripts",
    "swarm",
    "docker-worker.ts",
  );

  const child = spawn(
    "npx",
    ["tsx", scriptPath, taskId, instruction, branchName, agentCategory],
    {
      cwd: repoRoot,
      detached: true,
      stdio: "ignore",
      env: process.env,
      shell: process.platform === "win32",
    },
  );
  child.unref();
  const workerId = `worker-subprocess-${child.pid ?? "pending"}-${taskId}`;
  return { workerId };
}
