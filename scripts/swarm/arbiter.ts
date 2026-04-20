// Pass 5 — Postgres-backed arbiter.
// Source of truth for task selection is the `Issue` table in Postgres.
// Concurrency-safe across hosts via `SELECT ... FOR UPDATE SKIP LOCKED`.
// The JSON file at `.agents/swarm/state.json` is a debug snapshot only;
// it is NOT read here.

import prisma from "@/lib/prisma";
import type { Issue } from "@prisma/client";
import { Task, TaskStatus } from "./types";
import { toTask } from "./types";
import { getTracer, startTracing, stopTracing } from "./tracing";

/**
 * Atomically select-and-claim the next runnable task.
 *
 * Steps (within one transaction):
 *   1. Pick a `pending` row whose `blockedBy` is empty AND whose `dependencies`
 *      all point at `completed` issues, ordered by priority DESC then createdAt ASC.
 *      Use `FOR UPDATE SKIP LOCKED` so concurrent arbiters cannot claim the same row.
 *   2. Update that row to `in_progress` and stamp `startedAt`.
 *   3. Return the updated row mapped through `toTask(issue)`.
 *
 * Returns `null` when no candidate is available.
 */
export async function getNextAvailableTask(): Promise<Task | null> {
  const tracer = getTracer();
  return tracer.startActiveSpan(
    "Arbiter:getNextAvailableTask",
    async (span) => {
      try {
        const claimed = await prisma.$transaction(async (tx) => {
          // Step 1: select-and-lock a candidate.
          //
          // The Prisma.sql template tag parameterizes safely.
          // We enforce two constraints in one query:
          //   - blockedBy array is empty
          //   - every id in `dependencies` maps to an Issue with status='completed'
          //     (equivalent: NOT EXISTS any dependency id that is NOT completed)
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

          span.setAttribute("candidates.length", rows.length);

          if (rows.length === 0) {
            return null;
          }

          const candidate = rows[0];

          // Step 2: claim it.
          const updated = await tx.$queryRaw<Issue[]>`
          UPDATE "Issue"
          SET "status" = ${TaskStatus.InProgress},
              "startedAt" = NOW()
          WHERE "id" = ${candidate.id}
          RETURNING *
        `;

          return updated[0] ?? null;
        });

        if (!claimed) {
          span.end();
          return null;
        }

        const task = toTask(claimed);
        span.setAttribute("selected.taskId", task.id);
        span.end();
        return task;
      } catch (err: any) {
        span.recordException(err);
        span.end();
        throw err;
      }
    },
  );
}

// CLI usage
if (require.main === module) {
  startTracing();
  getNextAvailableTask()
    .then((task) => {
      if (task) {
        console.log(`Next task: ${task.id} (Priority: ${task.priority})`);
        console.log(`Title: ${task.title}`);
      } else {
        console.log("No pending tasks available.");
      }
    })
    .catch((err) => {
      console.error("Arbiter error:", err);
      process.exit(1);
    })
    .finally(() => {
      stopTracing();
    });
}
