// Pass 10 — Watchdog now operates on task_graph_state, not workers.json.
//
// The watchdog's new charter:
//   1. Scan `task_graph_state` for rows where status='running' AND
//      `lastTransitionAt < now() - SWARM_POLICY.workerTimeoutMinutes`.
//   2. For each stale row, call `StateGraph.interrupt(issueId, reason)` —
//      this is transactional; the row flips to status='interrupted' with a
//      reason attached. GraphState is preserved; resume-worker.ts can pick
//      it up on the next pool-manager tick.
//   3. Flip the owning `Issue.status` back to `pending` so the dispatcher
//      will pick it up again through the normal queue.
//   4. If a warm-pool container whose name contains the issueId is still
//      running, best-effort `docker kill` it via `child_process.spawn`.
//   5. Audit every intervention via `appendAudit`.
//
// The watchdog NEVER destroys state. Worktrees are left in place because
// the graph row is resumable; cleanup of orphaned worktrees is deferred to
// the dead-code cull scheduled for pass 20.

import prisma from "@/lib/prisma";
import { StateGraph, defineGraph } from "@/lib/orchestration/graph";
import { TaskStatus } from "./types";
import { getTracer, startTracing, stopTracing } from "./tracing";
import { SWARM_POLICY } from "./policy";
import { appendAudit } from "./audit";
import { spawnSync } from "node:child_process";
import { closeMemoryClient } from "./shared-memory";

// Reason tag written onto the interrupted row; matches the string documented
// in checkpoint-10.md frozen interfaces.
export const WATCHDOG_TIMEOUT_REASON = "watchdog_timeout";

/**
 * A minimal StateGraph instance built solely for `.interrupt()`. The node
 * registry is irrelevant to the interrupt path — the transaction only
 * touches the row's status/reason columns. We pass a trivial `no_op` node
 * so the constructor invariant (startNode exists in `nodes`) is satisfied.
 */
function getInterruptGraph(): StateGraph {
  return defineGraph({
    startNode: "no_op",
    nodes: {
      no_op: {
        name: "no_op",
        async run() {
          return { kind: "complete" };
        },
      },
    },
  });
}

/**
 * Best-effort: find a running container whose name contains `issueId` and
 * issue `docker kill`. Never throws. Designed for the warm-pool naming
 * convention `hlbw-worker-warm-<role>-<n>`; if the issueId is not in the
 * container name we return without killing anything.
 */
function maybeKillContainer(issueId: string): {
  killed: boolean;
  containerId?: string;
} {
  const ps = spawnSync(
    "docker",
    ["ps", "--filter", `name=worker-`, "--format", "{{.ID}} {{.Names}}"],
    { encoding: "utf8" },
  );
  if (ps.status !== 0) return { killed: false };
  const line = (ps.stdout ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.includes(issueId));
  if (!line) return { killed: false };
  const [containerId] = line.split(/\s+/);
  if (!containerId) return { killed: false };
  const kill = spawnSync("docker", ["kill", containerId], { encoding: "utf8" });
  if (kill.status !== 0) return { killed: false, containerId };
  return { killed: true, containerId };
}

export interface WatchdogInterruption {
  issueId: string;
  currentNode: string;
  lastTransitionAt: string;
  staleMinutes: number;
  killed: boolean;
  containerId?: string;
}

/**
 * Single run of the watchdog. Returns the list of interruptions performed.
 * Exported so tests can invoke it with a mocked Prisma client.
 */
export async function runWatchdog(): Promise<WatchdogInterruption[]> {
  const tracer = getTracer();
  return tracer.startActiveSpan("Watchdog:run", async (span) => {
    span.setAttribute("timeout.minutes", SWARM_POLICY.workerTimeoutMinutes);

    const now = Date.now();
    const staleCutoff = new Date(
      now - SWARM_POLICY.workerTimeoutMinutes * 60 * 1000,
    );

    const staleRows = await prisma.taskGraphState.findMany({
      where: {
        status: "running",
        lastTransitionAt: { lt: staleCutoff },
      },
      select: {
        issueId: true,
        currentNode: true,
        lastTransitionAt: true,
      },
    });

    span.setAttribute("stale.count", staleRows.length);

    const graph = getInterruptGraph();
    const interruptions: WatchdogInterruption[] = [];

    for (const row of staleRows) {
      const staleMinutes = Math.round(
        (now - row.lastTransitionAt.getTime()) / 60000,
      );
      const reason = `${WATCHDOG_TIMEOUT_REASON} (stale ${staleMinutes}m at node=${row.currentNode})`;

      try {
        await graph.interrupt(row.issueId, reason);
      } catch (err) {
        console.error(
          `[watchdog] failed to interrupt ${row.issueId}:`,
          (err as Error).message,
        );
        continue;
      }

      // Flip the parent Issue back to `pending` so the dispatcher and
      // pool-manager can re-queue. See checkpoint-10 §"Live invariants".
      try {
        await prisma.issue.update({
          where: { id: row.issueId },
          data: {
            status: TaskStatus.Pending,
            startedAt: null,
          },
        });
      } catch (err) {
        console.warn(
          `[watchdog] Issue.update failed for ${row.issueId}:`,
          (err as Error).message,
        );
      }

      const killResult = maybeKillContainer(row.issueId);

      await appendAudit({
        actor: "watchdog",
        action: "graph.interrupted",
        entityType: "task_graph_state",
        entityId: row.issueId,
        previousState: "running",
        newState: "interrupted",
        reason,
        metadata: {
          currentNode: row.currentNode,
          staleMinutes,
          containerKilled: killResult.killed,
          containerId: killResult.containerId,
        },
      });

      interruptions.push({
        issueId: row.issueId,
        currentNode: row.currentNode,
        lastTransitionAt: row.lastTransitionAt.toISOString(),
        staleMinutes,
        killed: killResult.killed,
        containerId: killResult.containerId,
      });

      console.log(
        `[watchdog] interrupted ${row.issueId} at node=${row.currentNode} (${staleMinutes}m stale); container killed=${killResult.killed}`,
      );
    }

    span.setAttribute("interruptions", interruptions.length);
    span.end();
    return interruptions;
  });
}

if (require.main === module) {
  startTracing();
  runWatchdog()
    .then((r) => {
      console.log(`[watchdog] interrupted ${r.length} stale graph rows.`);
    })
    .catch((err) => {
      console.error("[watchdog] fatal:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeMemoryClient();
      await stopTracing();
    });
}
