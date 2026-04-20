"use client";

// Pass 21 — SCION workflow graph visualiser.
//
// Props: issueId: string. Fetches /api/scion/workflow/[id]. Renders the
// 8-node graph as inline SVG (no Mermaid dep). Highlights the current node.
// Below: history timeline + last critic verdict (when present).

import React, { useState } from "react";
import useSWR from "swr";
import type { WorkflowSnapshot } from "@/lib/orchestration/introspection";
// Pass 24 — admin-only graph debug controls live inside the workflow card.
import GraphDebugPanel from "./GraphDebugPanel";

const fetcher = async (url: string): Promise<WorkflowSnapshot> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as WorkflowSnapshot;
};

interface Coord {
  x: number;
  y: number;
}

// Hard-coded coords for the 8 canonical nodes in
// lib/orchestration/introspection.ts::GRAPH_TOPOLOGY.
const NODE_COORDS: Record<string, Coord> = {
  init_mcp: { x: 60, y: 40 },
  build_context: { x: 220, y: 40 },
  explore: { x: 380, y: 40 },
  propose_plan: { x: 540, y: 40 },
  execute_step: { x: 120, y: 180 },
  record_observation: { x: 320, y: 180 },
  evaluate_completion: { x: 520, y: 180 },
  commit_or_loop: { x: 620, y: 280 },
};

const NODE_WIDTH = 140;
const NODE_HEIGHT = 44;

function pillPath(from: Coord, to: Coord): string {
  // Simple straight line; the SVG viewport handles clipping at the rect edges.
  const fx = from.x + NODE_WIDTH / 2;
  const fy = from.y + NODE_HEIGHT / 2;
  const tx = to.x + NODE_WIDTH / 2;
  const ty = to.y + NODE_HEIGHT / 2;
  return `M ${fx} ${fy} L ${tx} ${ty}`;
}

function edgeLabelPos(from: Coord, to: Coord): Coord {
  return {
    x: (from.x + NODE_WIDTH / 2 + to.x + NODE_WIDTH / 2) / 2,
    y: (from.y + NODE_HEIGHT / 2 + to.y + NODE_HEIGHT / 2) / 2 - 4,
  };
}

export interface WorkflowGraphProps {
  issueId: string;
}

export default function WorkflowGraph({
  issueId,
}: WorkflowGraphProps): React.ReactElement {
  const { data, error, isLoading, mutate } = useSWR<WorkflowSnapshot>(
    issueId ? `/api/scion/workflow/${issueId}` : null,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: false },
  );
  const [interrupting, setInterrupting] = useState(false);
  const [interruptError, setInterruptError] = useState<string | null>(null);

  async function handleForceInterrupt(): Promise<void> {
    if (!data) return;
    if (
      !window.confirm(
        `Force-interrupt the running graph for ${data.issueId}? ` +
          `The worker will be marked interrupted and its state frozen.`,
      )
    )
      return;
    setInterrupting(true);
    setInterruptError(null);
    try {
      const res = await fetch(`/api/scion/issue/${data.issueId}/interrupt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "user_force_interrupt" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setInterruptError(body.error ?? `request failed: ${res.status}`);
      } else {
        await mutate();
      }
    } catch (err: unknown) {
      setInterruptError(err instanceof Error ? err.message : String(err));
    } finally {
      setInterrupting(false);
    }
  }

  if (!issueId) {
    return <div className="workflow-graph">Select an issue to inspect.</div>;
  }
  if (isLoading || !data) {
    if (error) {
      return (
        <div className="workflow-graph">
          <div className="scion-error-banner">
            Failed to load workflow:{" "}
            {String((error as Error | undefined)?.message)}
          </div>
        </div>
      );
    }
    return <div className="workflow-graph">Loading workflow…</div>;
  }

  const current = data.currentNode ?? "";
  const canInterrupt = data.graphStatus === "running";
  return (
    <div className="workflow-graph">
      <h3 className="ops-section-title">
        Workflow for {data.issueId}{" "}
        <span className="config-panel__row-meta">
          status={data.graphStatus}
        </span>
        {canInterrupt ? (
          <button
            type="button"
            className="workflow-graph__interrupt"
            onClick={handleForceInterrupt}
            disabled={interrupting}
          >
            {interrupting ? "Interrupting…" : "Force interrupt"}
          </button>
        ) : null}
      </h3>
      {interruptError ? (
        <div className="scion-error-banner">{interruptError}</div>
      ) : null}
      <svg
        className="workflow-graph__svg"
        viewBox="0 0 780 360"
        role="img"
        aria-label="Workflow graph"
      >
        {/* Edges first so nodes render on top. */}
        {data.topology.edges.map((edge, i) => {
          const from = NODE_COORDS[edge.from];
          const to = NODE_COORDS[edge.to];
          if (!from || !to) return null;
          const labelPos = edgeLabelPos(from, to);
          return (
            <g key={`${edge.from}-${edge.to}-${i}`}>
              <path className="workflow-graph__edge" d={pillPath(from, to)} />
              {edge.label ? (
                <text
                  className="workflow-graph__edge-label"
                  x={labelPos.x}
                  y={labelPos.y}
                >
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {data.topology.nodes.map((name) => {
          const coord = NODE_COORDS[name];
          if (!coord) return null;
          const active = name === current;
          const cycles = data.cycleCounts[name] ?? 0;
          const label = cycles > 0 ? `${name} (${cycles}x)` : name;
          return (
            <g key={name}>
              <rect
                className={
                  active
                    ? "workflow-graph__node-rect workflow-graph__node-rect--active"
                    : "workflow-graph__node-rect"
                }
                x={coord.x}
                y={coord.y}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={6}
              />
              <text
                className="workflow-graph__node-label"
                x={coord.x + NODE_WIDTH / 2}
                y={coord.y + NODE_HEIGHT / 2}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>

      <ol className="workflow-history">
        {data.history.length === 0 ? (
          <li className="workflow-history__item">No transitions yet.</li>
        ) : null}
        {data.history.map((h, i) => {
          let chipClass = "status-pill status-pill--neutral";
          if (h.outcome === "error") chipClass = "status-pill status-pill--err";
          if (h.outcome === "interrupt")
            chipClass = "status-pill status-pill--warn";
          if (h.outcome === "ok") chipClass = "status-pill status-pill--ok";
          return (
            <li key={i} className="workflow-history__item">
              <span className="workflow-history__node">{h.node}</span>
              <span className={chipClass}>{h.outcome}</span>
              {h.detail ? (
                <span className="config-panel__row-meta">{h.detail}</span>
              ) : null}
              <span className="workflow-history__duration">
                {h.durationMs !== undefined ? `${h.durationMs} ms` : "-"}
              </span>
            </li>
          );
        })}
      </ol>

      {data.lastCriticVerdict ? (
        <div className="workflow-critic-verdict">
          <strong>Last critic verdict:</strong> {data.lastCriticVerdict.verdict}{" "}
          @ {data.lastCriticVerdict.confidence.toFixed(2)} (rubric:{" "}
          {data.lastCriticVerdict.rubric})
        </div>
      ) : null}
      <GraphDebugPanel
        issueId={data.issueId}
        topologyNodes={data.topology.nodes}
        currentNode={data.currentNode}
        graphStatus={data.graphStatus}
      />
    </div>
  );
}
