"use client";

// Pass 24 — SCION graph debug panel.
//
// Admin-only (also visible check: only renders when `role === "ADMIN"` and
// workflow status is running/paused/interrupted). Dropdown of the 7
// topology nodes + reason textarea. On submit, confirms via window.confirm
// and POSTs to /api/scion/workflow/[id]/force-transition.

import React, { useState } from "react";
import useSWR, { mutate } from "swr";
import type { ScionMeResponse } from "@/app/api/scion/me/route";

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
};

type RelevantStatus = "running" | "paused" | "interrupted";

function isRelevantStatus(status: string): status is RelevantStatus {
  return (
    status === "running" || status === "paused" || status === "interrupted"
  );
}

export interface GraphDebugPanelProps {
  issueId: string;
  topologyNodes: ReadonlyArray<string>;
  currentNode: string | null;
  graphStatus: string;
}

export default function GraphDebugPanel({
  issueId,
  topologyNodes,
  currentNode,
  graphStatus,
}: GraphDebugPanelProps): React.ReactElement | null {
  const { data: me } = useSWR<ScionMeResponse>(
    "/api/scion/me",
    (url) => fetcher<ScionMeResponse>(url),
    { revalidateOnFocus: false },
  );
  // Default to the current node so an operator sees it selected.
  const [nextNode, setNextNode] = useState<string>(
    currentNode ?? topologyNodes[0] ?? "",
  );
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  if (!me || me.role !== "ADMIN") return null;
  if (!isRelevantStatus(graphStatus)) return null;

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    if (nextNode.length === 0 || reason.trim().length === 0) return;
    if (
      !window.confirm(
        `Force-transition issue ${issueId} from ${currentNode ?? "?"} to ${nextNode}? This is a debug-only override.`,
      )
    )
      return;
    setSubmitting(true);
    setError(null);
    setLastSuccess(null);
    try {
      const res = await fetch(
        `/api/scion/workflow/${encodeURIComponent(issueId)}/force-transition`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nextNode, reason: reason.trim() }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as {
        from: string;
        to: string;
      };
      setLastSuccess(`moved ${body.from} → ${body.to}`);
      void mutate(`/api/scion/workflow/${issueId}`);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "force-transition failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="graph-debug-panel">
      <h4 className="graph-debug-panel__title">
        Graph debug (admin)
        <span className="graph-debug-panel__warn">destructive</span>
      </h4>
      <form className="graph-debug-panel__form" onSubmit={handleSubmit}>
        <label className="graph-debug-panel__label">
          Target node:{" "}
          <select
            className="graph-debug-panel__select"
            value={nextNode}
            onChange={(e) => setNextNode(e.target.value)}
          >
            {topologyNodes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="graph-debug-panel__label">
          Reason:
          <textarea
            className="graph-debug-panel__textarea"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why force this transition? (required, audited)"
          />
        </label>
        <button
          type="submit"
          className="graph-debug-panel__button"
          disabled={submitting || reason.trim().length === 0}
        >
          {submitting ? "Forcing…" : "Force transition"}
        </button>
      </form>
      {error ? <div className="scion-error-banner">{error}</div> : null}
      {lastSuccess ? (
        <div className="graph-debug-panel__success">{lastSuccess}</div>
      ) : null}
    </div>
  );
}
