"use client";

// Pass 23 — SCION budget breakdown.
//
// Three inline-SVG bar charts (per-task / per-model / per-day) fed from
// GET /api/scion/budget?groupBy=<dim>&from=&to=. No chart library — each
// bar is a <rect> inside a small <svg>, width proportional to the
// row's totalTokens within the visible set.

import React, { useState } from "react";
import useSWR from "swr";
import type {
  ScionBudgetResponse,
  BudgetGroupBy,
  BudgetBreakdownRow,
} from "@/app/api/scion/budget/route";

const fetcher = async (url: string): Promise<ScionBudgetResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as ScionBudgetResponse;
};

const GROUPS: ReadonlyArray<BudgetGroupBy> = ["task", "model", "day"];

const MAX_VISIBLE = 12;
const BAR_WIDTH_PX = 320;
const BAR_HEIGHT_PX = 18;

function Chart({
  title,
  rows,
}: {
  title: string;
  rows: BudgetBreakdownRow[];
}): React.ReactElement {
  const visible = rows.slice(0, MAX_VISIBLE);
  const max = visible.reduce((m, r) => Math.max(m, r.totalTokens), 1);
  return (
    <div className="budget-breakdown__chart">
      <h4 className="budget-breakdown__chart-title">{title}</h4>
      {visible.length === 0 ? (
        <div className="budget-breakdown__empty">(no data)</div>
      ) : null}
      {visible.map((row) => {
        const width = Math.max(
          2,
          Math.round((row.totalTokens / max) * BAR_WIDTH_PX),
        );
        return (
          <div key={row.label} className="budget-breakdown__row">
            <span className="budget-breakdown__label" title={row.label}>
              {row.label}
            </span>
            <svg
              width={BAR_WIDTH_PX}
              height={BAR_HEIGHT_PX}
              className="budget-breakdown__bar"
              role="img"
              aria-label={`${row.label}: ${row.totalTokens} tokens`}
            >
              <rect
                x={0}
                y={0}
                width={width}
                height={BAR_HEIGHT_PX}
                className="budget-breakdown__bar-fill"
              />
            </svg>
            <span className="budget-breakdown__value">
              {row.totalTokens.toLocaleString()} tok / {row.totalCalls} calls
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function BudgetBreakdown(): React.ReactElement {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const buildUrl = (group: BudgetGroupBy): string => {
    const qs = new URLSearchParams();
    qs.set("groupBy", group);
    if (from) qs.set("from", new Date(from).toISOString());
    if (to) qs.set("to", new Date(to).toISOString());
    return `/api/scion/budget?${qs.toString()}`;
  };

  const taskQuery = useSWR<ScionBudgetResponse>(buildUrl("task"), fetcher);
  const modelQuery = useSWR<ScionBudgetResponse>(buildUrl("model"), fetcher);
  const dayQuery = useSWR<ScionBudgetResponse>(buildUrl("day"), fetcher);

  const anyError = taskQuery.error || modelQuery.error || dayQuery.error;

  return (
    <div className="budget-breakdown">
      <h3 className="ops-section-title">Budget breakdown</h3>
      <div className="budget-breakdown__controls">
        <label className="budget-breakdown__control">
          From:{" "}
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="budget-breakdown__control">
          To:{" "}
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {anyError ? (
        <div className="scion-error-banner">
          Failed to load budget breakdown.
        </div>
      ) : null}
      <div className="budget-breakdown__charts">
        {GROUPS.map((g) => {
          const q =
            g === "task" ? taskQuery : g === "model" ? modelQuery : dayQuery;
          return <Chart key={g} title={`By ${g}`} rows={q.data?.rows ?? []} />;
        })}
      </div>
    </div>
  );
}
