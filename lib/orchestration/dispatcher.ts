// Pass 6 — Heartbeat-driven dispatcher.
//
// Thin wrapper API for Next.js server-side handlers to drive the swarm
// without importing the `scripts/swarm/*` runtime into the Next build.
// `scripts/` is excluded from the root `tsconfig.json` (see scripts/tsconfig.json
// split), so we keep the implementation self-contained here and invoke the
// worker via a subprocess (`npx tsx scripts/swarm/docker-worker.ts ...`).
//
// Exports:
//   - `dispatchReadyIssues(limit)` — atomically claim up to `limit` pending
//     Issues (one claim per tx, `SELECT ... FOR UPDATE SKIP LOCKED`) and spawn
//     a detached docker-worker child process for each.
//   - `reclaimStaleWorkers()` — mark Issues back to `pending` when their
//     `startedAt` predates the worker timeout (`SWARM_POLICY.workerTimeoutMinutes`).
//
// Types come from `@/scripts/swarm/types` via TS path alias; the alias is
// resolved by Next.js and jest's moduleNameMapper.

import { spawn } from "node:child_process";
import path from "node:path";
import prisma from "@/lib/prisma";
import type { Issue } from "@prisma/client";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Task } from "@/scripts/swarm/types";
import { TaskStatus } from "@/scripts/swarm/types";
import { SWARM_POLICY } from "@/scripts/swarm/policy";

export interface DispatchResult {
  taskId: string;
  /** Populated on successful spawn; null means spawn failed. */
  workerId: string | null;
  status: "spawned" | "failed";
  error?: string;
}

/**
 * Atomically select-and-claim one runnable Issue. Returns null when none
 * are available. Replicates `scripts/swarm/arbiter.ts:getNextAvailableTask`
 * inline so Next.js server-side code doesn't import the `scripts/*` tree.
 *
 * Within one transaction:
 *   1. SELECT ... FOR UPDATE SKIP LOCKED — pick a pending Issue whose
 *      `blockedBy` is empty and whose `dependencies` are all completed.
 *   2. UPDATE to `in_progress` and stamp `startedAt = now()`.
 */
async function claimOneReadyIssue(): Promise<Issue | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Issue[]>`
      SELECT *
      FROM "Issue"
      WHERE "status" = 'pending'
        AND "blockedBy" = '{}'::text[]
        AND NOT EXISTS (
          SELECT 1
          FROM unnest("dependencies") AS dep_id
          WHERE dep_id NOT IN (
            SELECT "id" FROM "Issue" WHERE "status" = 'completed'
          )
        )
      ORDER BY "priority" DESC, "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    if (rows.length === 0) return null;
    const candidate = rows[0];

    const updated = await tx.$queryRaw<Issue[]>`
      UPDATE "Issue"
      SET "status" = ${TaskStatus.InProgress},
          "startedAt" = NOW()
      WHERE "id" = ${candidate.id}
      RETURNING *
    `;

    return updated[0] ?? null;
  });
}

/**
 * Hook for tests. Production path forks `npx tsx scripts/swarm/docker-worker.ts`
 * as a detached child. Tests replace this via `jest.mock` so no Docker is
 * required in the heartbeat route test or the dispatcher integration test.
 */
export async function spawnWorkerSubprocess(
  taskId: string,
  instruction: string,
  branchName: string,
  agentCategory: string,
): Promise<{ workerId: string }> {
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
  // Detach so the Next.js handler can return without holding the child.
  child.unref();
  const workerId = `worker-subprocess-${child.pid ?? "pending"}-${taskId}`;
  return { workerId };
}

/**
 * Drain up to `limit` ready Issues. Each claim is its own transaction so
 * a slow spawn cannot block the next claim, and concurrent dispatchers
 * (host + Cloud Scheduler) never race for the same row.
 */
export async function dispatchReadyIssues(
  limit: number = 5,
): Promise<DispatchResult[]> {
  if (!Number.isFinite(limit) || limit <= 0) return [];

  const results: DispatchResult[] = [];

  for (let i = 0; i < limit; i++) {
    const claimed = await claimOneReadyIssue();
    if (!claimed) break;

    const branchName =
      typeof claimed.metadata === "object" &&
      claimed.metadata !== null &&
      "branchName" in claimed.metadata &&
      typeof (claimed.metadata as Record<string, unknown>).branchName ===
        "string"
        ? ((claimed.metadata as Record<string, unknown>).branchName as string)
        : `issue/${claimed.id}`;

    const agentCategory = claimed.agentCategory ?? "default";

    try {
      const { workerId } = await spawnWorkerSubprocess(
        claimed.id,
        claimed.instruction,
        branchName,
        agentCategory,
      );
      results.push({ taskId: claimed.id, workerId, status: "spawned" });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "spawn failed";
      // Put the Issue back so a future heartbeat retries it.
      try {
        await prisma.issue.update({
          where: { id: claimed.id },
          data: { status: TaskStatus.Pending, startedAt: null },
        });
      } catch {
        // Swallow — we still want to report the spawn failure.
      }
      results.push({
        taskId: claimed.id,
        workerId: null,
        status: "failed",
        error: msg,
      });
    }
  }

  return results;
}

/**
 * Finds Issues that have been `in_progress` for longer than
 * `SWARM_POLICY.workerTimeoutMinutes` and reverts them to `pending` so the
 * next heartbeat picks them up. Returns the count of reclaimed rows.
 *
 * This is the "hung issue recovery" that the original heartbeat stub only
 * counted. It now actually does the recovery.
 */
export async function reclaimStaleWorkers(): Promise<number> {
  const timeoutMs = SWARM_POLICY.workerTimeoutMinutes * 60 * 1000;
  const cutoff = new Date(Date.now() - timeoutMs);

  const { count } = await prisma.issue.updateMany({
    where: {
      status: TaskStatus.InProgress,
      startedAt: { lt: cutoff, not: null },
    },
    data: {
      status: TaskStatus.Pending,
      startedAt: null,
    },
  });

  return count;
}
