"use client";

// Pass 21 — SCION trace sidebar.
// Pass 23 — accepts optional filter props (status / category / from / to) and
// renders a "Open in Jaeger" link per row via `traceJaegerUrl`.
//
// Calls /api/scion/traces?issueId=&limit=20 plus any active filter params.
// Renders a vertical list of recent runs with status, duration, node count,
// model ids, total tokens.

import React, { useState } from "react";
import useSWR from "swr";
import type { ScionTracesResponse } from "@/app/api/scion/traces/route";
import type { TraceSummary } from "@/lib/orchestration/tracing/summaries";
import { traceJaegerUrl } from "./TraceFilters";

const fetcher = async (url: string): Promise<ScionTracesResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as ScionTracesResponse;
};

function statusPillClass(s: TraceSummary["status"]): string {
  if (s === "ok") return "status-pill status-pill--ok";
  if (s === "error") return "status-pill status-pill--err";
  return "status-pill status-pill--warn";
}

export interface TraceSidebarProps {
  issueId?: string;
  onSelect?: (taskId: string) => void;
  status?: string;
  category?: string;
  from?: string;
  to?: string;
}

export default function TraceSidebar({
  issueId,
  onSelect,
  status,
  category,
  from,
  to,
}: TraceSidebarProps): React.ReactElement {
  const qs = new URLSearchParams();
  qs.set("limit", "20");
  if (issueId) qs.set("issueId", issueId);
  if (status) qs.set("status", status);
  if (category) qs.set("category", category);
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) qs.set("from", d.toISOString());
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) qs.set("to", d.toISOString());
  }
  const { data, error, isLoading } = useSWR<ScionTracesResponse>(
    `/api/scion/traces?${qs.toString()}`,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: false },
  );
  const [selected, setSelected] = useState<string | null>(null);

  if (isLoading) return <div className="trace-sidebar">Loading traces…</div>;
  if (error || !data) {
    return (
      <div className="trace-sidebar">
        <div className="scion-error-banner">
          Failed to load traces: {String((error as Error | undefined)?.message)}
        </div>
      </div>
    );
  }
  return (
    <div className="trace-sidebar">
      <h3 className="ops-section-title">
        Recent traces ({data.traces.length})
      </h3>
      {data.traces.length === 0 ? (
        <div className="memory-browser__empty">No traces recorded yet.</div>
      ) : null}
      {data.traces.map((t) => {
        const tokens = t.totalTokens.input + t.totalTokens.output;
        const active = selected === t.taskId;
        return (
          <div
            key={`${t.taskId}-${t.startedAt}`}
            className="trace-sidebar__item-wrap"
          >
            <button
              type="button"
              className="trace-sidebar__item"
              onClick={() => {
                setSelected(t.taskId);
                if (onSelect) onSelect(t.taskId);
              }}
              style={active ? { borderColor: "#38bdf8" } : undefined}
            >
              <div className="trace-sidebar__item-header">
                <span className="trace-sidebar__task-id">{t.taskId}</span>
                <span className={statusPillClass(t.status)}>{t.status}</span>
              </div>
              <div className="trace-sidebar__meta">
                nodes={t.nodeCount} | duration={t.durationMs}ms | tokens=
                {tokens}
              </div>
            </button>
            <a
              className="trace-sidebar__jaeger-link"
              href={traceJaegerUrl(t.taskId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Jaeger
            </a>
          </div>
        );
      })}
    </div>
  );
}
