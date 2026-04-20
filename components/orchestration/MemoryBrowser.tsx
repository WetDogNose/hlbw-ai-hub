"use client";

// Pass 21 — SCION memory browser.
// Pass 23 — adds per-row admin-only delete (uses window.confirm).
//
// Paginated list of MemoryEpisode rows via /api/scion/memory. Filter by kind;
// click a row to expand the JSON content.

import React, { useState } from "react";
import useSWR, { mutate } from "swr";
import type {
  ScionMemoryResponse,
  MemoryRow,
} from "@/app/api/scion/memory/route";
import type { MemoryEpisodeKind } from "@/lib/orchestration/memory/MemoryStore";

const fetcher = async (url: string): Promise<ScionMemoryResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as ScionMemoryResponse;
};

const KINDS: ReadonlyArray<MemoryEpisodeKind | ""> = [
  "",
  "task_context",
  "discovery",
  "decision",
  "entity",
  "observation",
  "relation",
];

export default function MemoryBrowser(): React.ReactElement {
  const [kind, setKind] = useState<string>("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const qs = new URLSearchParams();
  qs.set("limit", "25");
  if (kind) qs.set("kind", kind);
  if (cursor) qs.set("cursor", cursor);

  const swrKey = `/api/scion/memory?${qs.toString()}`;
  const { data, error, isLoading } = useSWR<ScionMemoryResponse>(
    swrKey,
    fetcher,
    { revalidateOnFocus: false },
  );

  const handleDelete = async (id: string): Promise<void> => {
    const ok = window.confirm(
      `Delete memory episode ${id}? This cannot be undone.`,
    );
    if (!ok) return;
    setDeleting(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/scion/memory/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setDeleteError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      void mutate(swrKey);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="memory-browser">
      <h3 className="ops-section-title">Memory browser</h3>
      <div className="memory-browser__controls">
        <label>
          Kind:{" "}
          <select
            className="memory-browser__select"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setCursor(null);
            }}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k === "" ? "(all)" : k}
              </option>
            ))}
          </select>
        </label>
        <div className="memory-browser__pagination">
          <button
            className="memory-browser__button"
            type="button"
            disabled={cursor === null}
            onClick={() => setCursor(null)}
          >
            Reset
          </button>
          <button
            className="memory-browser__button"
            type="button"
            disabled={!data?.nextCursor}
            onClick={() => {
              if (data?.nextCursor) setCursor(data.nextCursor);
            }}
          >
            Next page
          </button>
        </div>
      </div>

      {isLoading ? <div>Loading memory…</div> : null}
      {error ? (
        <div className="scion-error-banner">
          Failed to load memory: {String((error as Error | undefined)?.message)}
        </div>
      ) : null}
      {deleteError ? (
        <div className="scion-error-banner">Delete failed: {deleteError}</div>
      ) : null}

      {data && data.rows.length === 0 ? (
        <div className="memory-browser__empty">No episodes.</div>
      ) : null}

      {data?.rows.map((row: MemoryRow) => {
        const isOpen = Boolean(expanded[row.id]);
        const isDeleting = deleting === row.id;
        return (
          <div key={row.id} className="memory-browser__row">
            <div className="memory-browser__row-header">
              <span>
                <code>{row.id}</code> | {row.kind} | {row.agentCategory ?? "-"}
              </span>
              <span>{row.createdAt}</span>
            </div>
            <div className="memory-browser__summary">{row.summary}</div>
            <div className="memory-browser__row-actions">
              <button
                className="memory-browser__button"
                type="button"
                onClick={() =>
                  setExpanded((prev) => ({ ...prev, [row.id]: !isOpen }))
                }
              >
                {isOpen ? "Hide content" : "Show content"}
              </button>
              <button
                className="memory-browser__delete"
                type="button"
                onClick={() => void handleDelete(row.id)}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
            {isOpen ? (
              <pre className="memory-browser__content">
                {JSON.stringify(row.content, null, 2)}
              </pre>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
