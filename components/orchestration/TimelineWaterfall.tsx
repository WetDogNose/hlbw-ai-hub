"use client";

// Task execution timeline — renders TaskGraphState.history as a horizontal
// waterfall in the Workflow tab. This is NOT a replacement for Jaeger span
// drill-down (OTEL spans carry far more metadata — tool calls, token usage,
// rubric check outcomes per node); it's an at-a-glance view of the graph
// transitions the UI already polls from /api/scion/workflow/[id], so you can
// spot long/failed/interrupt-loop steps without leaving the dashboard.

import React, { useMemo } from "react";
import useSWR from "swr";
import type { WorkflowSnapshot } from "@/lib/orchestration/introspection";

const fetcher = async (url: string): Promise<WorkflowSnapshot> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as WorkflowSnapshot;
};

export interface TimelineWaterfallProps {
  issueId: string;
}

interface Row {
  node: string;
  outcome: "ok" | "error" | "interrupt" | string;
  enteredAt: number;
  exitedAt: number;
  durationMs: number;
  detail?: string;
}

function outcomeClass(outcome: string): string {
  switch (outcome) {
    case "ok":
      return "timeline-waterfall__bar--ok";
    case "error":
      return "timeline-waterfall__bar--error";
    case "interrupt":
      return "timeline-waterfall__bar--warn";
    default:
      return "timeline-waterfall__bar--neutral";
  }
}

export default function TimelineWaterfall({
  issueId,
}: TimelineWaterfallProps): React.ReactElement {
  const { data, error, isLoading } = useSWR<WorkflowSnapshot>(
    issueId ? `/api/scion/workflow/${issueId}` : null,
    fetcher,
    { refreshInterval: 15000, revalidateOnFocus: false },
  );

  const { rows, start, end } = useMemo(() => {
    if (!data || !Array.isArray(data.history) || data.history.length === 0) {
      return { rows: [] as Row[], start: 0, end: 0 };
    }
    const raw: Row[] = [];
    for (const h of data.history) {
      const enteredAt = h.enteredAt ? new Date(h.enteredAt).getTime() : NaN;
      const exitedAt = h.exitedAt ? new Date(h.exitedAt).getTime() : NaN;
      if (!Number.isFinite(enteredAt) || !Number.isFinite(exitedAt)) continue;
      raw.push({
        node: h.node,
        outcome: h.outcome,
        enteredAt,
        exitedAt,
        durationMs:
          typeof h.durationMs === "number"
            ? h.durationMs
            : Math.max(0, exitedAt - enteredAt),
        detail: h.detail,
      });
    }
    const startTs = Math.min(...raw.map((r) => r.enteredAt));
    const endTs = Math.max(...raw.map((r) => r.exitedAt));
    return { rows: raw, start: startTs, end: endTs };
  }, [data]);

  if (!issueId) {
    return (
      <div className="timeline-waterfall">Select an issue to inspect.</div>
    );
  }
  if (isLoading && !data) {
    return <div className="timeline-waterfall">Loading timeline…</div>;
  }
  if (error) {
    return (
      <div className="timeline-waterfall">
        <div className="scion-error-banner">
          Failed to load timeline:{" "}
          {String((error as Error | undefined)?.message)}
        </div>
      </div>
    );
  }
  if (!data || rows.length === 0) {
    return (
      <div className="timeline-waterfall">
        <h3 className="ops-section-title">Timeline</h3>
        <div className="config-panel__row-meta">
          No transitions recorded yet.
        </div>
      </div>
    );
  }

  const span = Math.max(1, end - start);
  const totalDurationMs = span;
  const totalSec = (totalDurationMs / 1000).toFixed(1);

  return (
    <div className="timeline-waterfall">
      <h3 className="ops-section-title">
        Timeline{" "}
        <span className="config-panel__row-meta">
          {rows.length} transitions over {totalSec}s
        </span>
      </h3>
      <div className="timeline-waterfall__rows">
        {rows.map((r, i) => {
          const leftPct = ((r.enteredAt - start) / span) * 100;
          const widthPct = Math.max(0.5, (r.durationMs / span) * 100);
          return (
            <div className="timeline-waterfall__row" key={i}>
              <div className="timeline-waterfall__label" title={r.node}>
                {r.node}
              </div>
              <div className="timeline-waterfall__track">
                <div
                  className={`timeline-waterfall__bar ${outcomeClass(r.outcome)}`}
                  style={{
                    left: `${leftPct.toFixed(2)}%`,
                    width: `${widthPct.toFixed(2)}%`,
                  }}
                  title={`${r.node} · ${r.outcome} · ${r.durationMs}ms${
                    r.detail ? ` · ${r.detail}` : ""
                  }`}
                />
              </div>
              <div className="timeline-waterfall__duration">
                {r.durationMs}ms
              </div>
            </div>
          );
        })}
      </div>
      <div className="timeline-waterfall__axis">
        <span>0ms</span>
        <span>{totalDurationMs}ms</span>
      </div>
    </div>
  );
}
