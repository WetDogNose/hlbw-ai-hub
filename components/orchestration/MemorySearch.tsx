"use client";

// Pass 23 — SCION memory similarity search.
//
// Text input + optional kind selector → POST /api/scion/memory/search. Admin
// route (route enforces); this component renders the 403 banner gracefully.

import React, { useState } from "react";
import type {
  MemorySearchRow,
  ScionMemorySearchResponse,
} from "@/app/api/scion/memory/search/route";
import type { MemoryEpisodeKind } from "@/lib/orchestration/memory/MemoryStore";

const KINDS: ReadonlyArray<MemoryEpisodeKind | ""> = [
  "",
  "task_context",
  "discovery",
  "decision",
  "entity",
  "observation",
  "relation",
];

export default function MemorySearch(): React.ReactElement {
  const [query, setQuery] = useState<string>("");
  const [kind, setKind] = useState<string>("");
  const [limit, setLimit] = useState<number>(10);
  const [rows, setRows] = useState<MemorySearchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    if (query.trim().length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scion/memory/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          limit,
          ...(kind ? { kind } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? `HTTP ${res.status}`);
        setRows([]);
        return;
      }
      const data = (await res.json()) as ScionMemorySearchResponse;
      setRows(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "search failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="memory-search">
      <h3 className="ops-section-title">Memory search</h3>
      <form className="memory-search__form" onSubmit={handleSubmit}>
        <input
          className="memory-search__input"
          type="text"
          placeholder="Similarity query…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="memory-search__label">
          Kind:{" "}
          <select
            className="memory-search__select"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k === "" ? "(any)" : k}
              </option>
            ))}
          </select>
        </label>
        <label className="memory-search__label">
          Limit:{" "}
          <input
            type="number"
            className="memory-search__limit"
            min={1}
            max={50}
            value={limit}
            onChange={(e) =>
              setLimit(Math.max(1, Math.min(50, Number(e.target.value) || 10)))
            }
          />
        </label>
        <button
          type="submit"
          className="memory-search__button"
          disabled={loading}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {error ? <div className="scion-error-banner">{error}</div> : null}
      {rows.length === 0 && !loading && !error ? (
        <div className="memory-browser__empty">
          No results yet — run a query.
        </div>
      ) : null}
      {rows.map((row) => {
        const isOpen = Boolean(expanded[row.id]);
        return (
          <div key={row.id} className="memory-search__row">
            <div className="memory-search__row-header">
              <span>
                <code>{row.id}</code> | {row.kind} | dist=
                {row.distance.toFixed(4)}
              </span>
              <span>{row.createdAt}</span>
            </div>
            <div className="memory-search__summary">{row.summary}</div>
            <button
              type="button"
              className="memory-search__button"
              onClick={() =>
                setExpanded((prev) => ({ ...prev, [row.id]: !isOpen }))
              }
            >
              {isOpen ? "Hide content" : "Show content"}
            </button>
            {isOpen ? (
              <pre className="memory-search__content">
                {JSON.stringify(row.content, null, 2)}
              </pre>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
