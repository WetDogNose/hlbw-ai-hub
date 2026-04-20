// Pass 9 — agent-runner is now a thin graph driver.
//
// The linear 30-turn Gemini chat loop that used to live here has been
// decomposed into discrete StateGraph nodes under `scripts/swarm/runner/
// nodes.ts`. This entry point boots OTEL, starts a graph for the given
// `AGENT_ISSUE_ID`, and pumps `transition()` calls until the graph emits
// a terminal outcome (`complete`, `error`, or `interrupt`).
//
// Pass 10 will add resume semantics; pass 11 splits the nodes into
// actor/critic/orchestrator files; pass 15 rewrites `build_context`.

import { startTracing, stopTracing, getTracer } from "./tracing";
import { defineAgentGraph } from "./runner/nodes";
import type { NodeOutcome } from "@/lib/orchestration/graph";

// Re-export the legacy helper symbols so any external importer (watchdog /
// pool-manager debug paths) still finds them at their original location.
export {
  translateWindowsPathToLinux,
  initializeMCPServers,
  baseToolCatalogue,
  runnerRuntime,
} from "./runner/nodes";

async function main(): Promise<void> {
  startTracing();

  const issueId = process.env.AGENT_ISSUE_ID ?? process.argv[2];
  if (!issueId) {
    throw new Error("AGENT_ISSUE_ID env var or argv[2] required");
  }

  const agentCategory = process.env.AGENT_CATEGORY || "default";
  const modelId = process.env.AGENT_MODEL_ID || "gemini-3.1-pro";
  const worktreePath = process.env.WORKTREE_PATH || "/workspace";
  const instruction = process.env.AGENT_INSTRUCTION || "";
  const maxIterations = Number(process.env.AGENT_MAX_ITERATIONS || 30);

  const graph = defineAgentGraph();

  // Pass 10 — check for an existing graph row. If one exists, we're in a
  // resume path (spawned by `resume-worker.ts` or the watchdog); skip
  // `start()` and go straight into the transition loop. Otherwise create
  // a fresh row with the initial RunnerContext.
  const existing = await graph.get(issueId);
  if (!existing) {
    // Pass 14 — explorationBudget defaults to 8 (env override); empty
    // history on start. The explore node is the first transition after
    // build_context.
    const envBudget = Number(process.env.AGENT_EXPLORATION_BUDGET);
    const explorationBudget =
      Number.isFinite(envBudget) && envBudget >= 0 ? envBudget : 8;
    await graph.start(issueId, {
      taskId: issueId,
      agentCategory,
      modelId,
      worktreePath,
      instruction,
      chatHistory: [],
      iterations: 0,
      maxIterations,
      explorationBudget,
      explorationHistory: [],
      worker: {
        provider: process.env.AGENT_PROVIDER || "gemini",
        modelId,
        containerId:
          process.env.WARM_POOL_ID || process.env.HOSTNAME || "unknown",
        startedAt: new Date().toISOString(),
      },
    });
  } else {
    console.log(
      `[agent-runner] resuming issue ${issueId} at node=${existing.currentNode} (status=${existing.status})`,
    );
  }

  const tracer = getTracer("agent-runner");

  let current: NodeOutcome = { kind: "goto", next: "init_mcp" };
  while (current.kind === "goto") {
    current = await tracer.startActiveSpan(
      "Node:transition",
      async (span): Promise<NodeOutcome> => {
        try {
          const result = await graph.transition(issueId);
          span.setAttribute("node.kind", result.outcome.kind);
          if (result.outcome.kind === "goto") {
            span.setAttribute("node.next", result.outcome.next);
          }
          return result.outcome;
        } catch (err) {
          span.recordException(err as Error);
          span.setAttribute("error", true);
          return {
            kind: "error",
            error: err instanceof Error ? err : new Error(String(err)),
          };
        } finally {
          span.end();
        }
      },
    );
  }

  const terminal: NodeOutcome = current;
  if (terminal.kind === "error") {
    console.error(
      `[agent-runner] task ${issueId} ended in error: ${terminal.error.message}`,
    );
  } else if (terminal.kind === "interrupt") {
    console.log(
      `[agent-runner] task ${issueId} interrupted: ${terminal.reason}`,
    );
  } else {
    console.log(`[agent-runner] task ${issueId} completed.`);
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("[agent-runner] fatal:", err);
      process.exit(1);
    })
    .finally(() => {
      void stopTracing();
    });
}

export { main };
