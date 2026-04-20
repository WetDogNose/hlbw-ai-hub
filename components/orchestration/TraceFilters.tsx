"use client";

// Pass 23 — SCION trace filters.
//
// Controlled component that renders status + category + from/to date pickers.
// Emits filter changes upward so the hosting tab can flow them into
// `TraceSidebar` (and ultimately the `/api/scion/traces` query).
//
// Also exports `traceJaegerUrl(taskId)` so sidebar rows can render an
// "Open in Jaeger" link pointing at the local Jaeger UI.

import React from "react";

export interface TraceFilterValues {
  status: string;
  category: string;
  from: string;
  to: string;
}

export interface TraceFiltersProps {
  value: TraceFilterValues;
  onChange: (next: TraceFilterValues) => void;
  categories?: string[];
}

const STATUSES: ReadonlyArray<string> = ["ok", "error", "interrupted"];
const DEFAULT_JAEGER_ORIGIN = "http://localhost:16686";

/**
 * Build the Jaeger search URL for a given task id. The tag query uses
 * the canonical `hlbw.task.id` attribute (SPAN_ATTR.TASK_ID in
 * lib/orchestration/tracing/attrs.ts). Values are URL-encoded with
 * `encodeURIComponent` to survive special characters in ids.
 */
export function traceJaegerUrl(taskId: string): string {
  const tags = JSON.stringify({ "hlbw.task.id": taskId });
  const qs = new URLSearchParams();
  qs.set("tags", tags);
  return `${DEFAULT_JAEGER_ORIGIN}/search?${qs.toString()}`;
}

export default function TraceFilters({
  value,
  onChange,
  categories,
}: TraceFiltersProps): React.ReactElement {
  const update = (patch: Partial<TraceFilterValues>): void => {
    onChange({ ...value, ...patch });
  };
  return (
    <div className="trace-filters">
      <label className="trace-filters__control">
        Status:{" "}
        <select
          className="trace-filters__select"
          value={value.status}
          onChange={(e) => update({ status: e.target.value })}
        >
          <option value="">(any)</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="trace-filters__control">
        Category:{" "}
        <select
          className="trace-filters__select"
          value={value.category}
          onChange={(e) => update({ category: e.target.value })}
        >
          <option value="">(any)</option>
          {(categories ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="trace-filters__control">
        From:{" "}
        <input
          type="datetime-local"
          className="trace-filters__input"
          value={value.from}
          onChange={(e) => update({ from: e.target.value })}
        />
      </label>
      <label className="trace-filters__control">
        To:{" "}
        <input
          type="datetime-local"
          className="trace-filters__input"
          value={value.to}
          onChange={(e) => update({ to: e.target.value })}
        />
      </label>
    </div>
  );
}
