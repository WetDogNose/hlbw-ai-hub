"use client";

// Admin audit log viewer. Consumes the existing memory browser endpoint
// (/api/scion/memory?kind=decision) and projects each row into an actor /
// action / payload triple so the operator can scan the admin-triggered state
// changes (cancel, resume, resolve, etc.) without spelunking the raw JSON.
//
// Scope: pure client read; no mutation. Admin-gated at the memory store layer
// only through the normal SWR surface — if the route 403s the card shows the
// error banner. The `recordAdminAction` helper stamps:
//   summary   = `${actor}:${action}`
//   content   = { action, payload, actor, actorRole }
//   taskId    = payload.issueId when present

import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { ShieldAlert } from "lucide-react";
import type { ScionMemoryResponse } from "@/app/api/scion/memory/route";

const fetcher = async (url: string): Promise<ScionMemoryResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as ScionMemoryResponse;
};

interface ParsedDecision {
  id: string;
  createdAt: string;
  actor: string;
  action: string;
  issueId: string | null;
  payload: unknown;
}

function parseRow(row: ScionMemoryResponse["rows"][number]): ParsedDecision {
  const content = (row.content ?? {}) as {
    action?: unknown;
    actor?: unknown;
    payload?: unknown;
  };
  return {
    id: row.id,
    createdAt: row.createdAt,
    actor: typeof content.actor === "string" ? content.actor : "unknown",
    action: typeof content.action === "string" ? content.action : "unknown",
    issueId: row.taskId ?? null,
    payload: content.payload ?? null,
  };
}

export default function AuditLogViewer(): React.ReactElement {
  const [cursor, setCursor] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [actorFilter, setActorFilter] = useState<string>("");
  const { data, error, isLoading } = useSWR<ScionMemoryResponse>(
    `/api/scion/memory?kind=decision&limit=50${cursor ? `&cursor=${cursor}` : ""}`,
    fetcher,
    { refreshInterval: 10000, revalidateOnFocus: false },
  );

  const parsed = useMemo(() => (data?.rows ?? []).map(parseRow), [data?.rows]);

  const visible = useMemo(() => {
    return parsed.filter((p) => {
      if (
        actionFilter &&
        !p.action.toLowerCase().includes(actionFilter.toLowerCase())
      ) {
        return false;
      }
      if (
        actorFilter &&
        !p.actor.toLowerCase().includes(actorFilter.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [parsed, actionFilter, actorFilter]);

  const actions = useMemo(() => {
    const s = new Set<string>();
    for (const p of parsed) s.add(p.action);
    return Array.from(s).sort();
  }, [parsed]);

  return (
    <div className="audit-log-viewer">
      <h3 className="ops-section-title">
        <ShieldAlert size={18} /> Audit log
      </h3>
      <div className="audit-log-viewer__controls">
        <label className="issue-inbox__control-label">
          action
          <select
            className="issue-inbox__control"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="">all</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <input
          type="search"
          className="issue-inbox__search"
          placeholder="actor email…"
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
        />
      </div>
      {error ? (
        <div className="scion-error-banner">
          Failed to load audit log:{" "}
          {String((error as Error | undefined)?.message)}
        </div>
      ) : null}
      {isLoading && !data ? (
        <div className="config-panel__row-meta">Loading audit log…</div>
      ) : null}
      {visible.length === 0 && !isLoading ? (
        <div className="issue-inbox__empty">No audit entries match.</div>
      ) : null}
      <ul className="audit-log-viewer__list">
        {visible.map((p) => (
          <li key={p.id} className="audit-log-viewer__row">
            <div className="audit-log-viewer__row-header">
              <span className="audit-log-viewer__action">{p.action}</span>
              <span className="audit-log-viewer__actor">{p.actor}</span>
              <span className="config-panel__row-meta">{p.createdAt}</span>
            </div>
            {p.issueId ? (
              <div className="config-panel__row-meta">
                issue: {p.issueId.slice(0, 12)}
              </div>
            ) : null}
            {p.payload !== null &&
            Object.keys(p.payload as object).length > 0 ? (
              <pre className="issue-detail__pre issue-detail__pre--compact">
                {JSON.stringify(p.payload, null, 2)}
              </pre>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="audit-log-viewer__pagination">
        <button
          type="button"
          className="issue-row__action"
          onClick={() => setCursor(null)}
          disabled={!cursor}
        >
          Reset
        </button>
        <button
          type="button"
          className="issue-row__action"
          onClick={() => {
            if (data?.nextCursor) setCursor(data.nextCursor);
          }}
          disabled={!data?.nextCursor}
        >
          Older
        </button>
      </div>
    </div>
  );
}
