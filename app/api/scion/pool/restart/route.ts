// Pass 22 — restart the warm worker pool (async).
//
// POST /api/scion/pool/restart
// Spawns `scripts/swarm/pool-manager.ts` as a detached child process. Returns
// 202 + `{ jobId }`. Status is tracked in the in-memory `poolRestartJobs`
// map; poll `GET /api/scion/pool/restart/[jobId]`.

import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import { poolRestartJobs, newJobId, type PoolRestartJob } from "./jobs";

export interface PoolRestartResponse {
  jobId: string;
  status: PoolRestartJob["status"];
  startedAt: string;
}

const STDOUT_TAIL_LIMIT = 4_000;

export async function POST(): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  const jobId = newJobId();
  const startedAt = new Date().toISOString();
  const job: PoolRestartJob = {
    id: jobId,
    status: "running",
    startedAt,
  };
  poolRestartJobs.set(jobId, job);

  try {
    const repoRoot = process.cwd();
    const scriptPath = path.join(
      repoRoot,
      "scripts",
      "swarm",
      "pool-manager.ts",
    );
    const child = spawn("npx", ["tsx", scriptPath], {
      cwd: repoRoot,
      env: process.env,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > STDOUT_TAIL_LIMIT) {
        stdout = stdout.slice(-STDOUT_TAIL_LIMIT);
      }
      job.stdoutTail = stdout;
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > STDOUT_TAIL_LIMIT) {
        stderr = stderr.slice(-STDOUT_TAIL_LIMIT);
      }
    });
    child.on("exit", (code) => {
      job.status = code === 0 ? "completed" : "failed";
      job.finishedAt = new Date().toISOString();
      job.exitCode = code;
      if (code !== 0) {
        job.error = stderr || `pool-manager exited with code ${code ?? "?"}`;
      }
    });
    child.on("error", (err: Error) => {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = err.message;
    });

    await recordAdminAction(user, "pool.restart", { jobId });
    const body: PoolRestartResponse = {
      jobId,
      status: job.status,
      startedAt,
    };
    return NextResponse.json(body, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "spawn failed";
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.error = message;
    console.error("/api/scion/pool/restart error:", err);
    return NextResponse.json(
      { error: message, jobId },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
