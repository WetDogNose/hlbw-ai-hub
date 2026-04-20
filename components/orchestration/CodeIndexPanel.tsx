"use client";

// Pass 24 — SCION code-index admin panel.
//
// Displays total indexed `entity` count from GET /api/scion/memory?kind=entity&count=1,
// offers three actions — Re-seed (default paths), Re-embed all (reembed flag),
// and Dry run — each with a confirm prompt. When a job id exists in local
// state we poll GET /api/scion/code-index/seed/[jobId] every 3s for progress.

import React, { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import type { ScionMemoryResponse } from "@/app/api/scion/memory/route";
import type { SeedJob } from "@/app/api/scion/code-index/seed/jobs";

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
};

const COUNT_KEY = "/api/scion/memory?kind=entity&count=1";

type Action = "seed" | "reembed" | "dryrun";

export default function CodeIndexPanel(): React.ReactElement {
  const { data: countData, error: countError } = useSWR<ScionMemoryResponse>(
    COUNT_KEY,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 10_000 },
  );
  const [jobId, setJobId] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: jobData } = useSWR<SeedJob>(
    jobId ? `/api/scion/code-index/seed/${jobId}` : null,
    fetcher,
    { refreshInterval: 3_000, revalidateOnFocus: false },
  );

  useEffect(() => {
    if (jobData && jobData.status !== "running") {
      // Refresh the count once the job finishes.
      void mutate(COUNT_KEY);
    }
  }, [jobData]);

  const total = countData?.count ?? 0;

  const handleAction = async (action: Action): Promise<void> => {
    const label =
      action === "seed"
        ? "Re-seed the code index (incremental)?"
        : action === "reembed"
          ? "Re-embed ALL symbols? This ignores the hash gate and is expensive."
          : "Run the seeder in dry-run mode (no DB writes)?";
    if (!window.confirm(label)) return;

    setActionInFlight(action);
    setError(null);
    try {
      const body: {
        reembed?: boolean;
        dryRun?: boolean;
      } = {};
      if (action === "reembed") body.reembed = true;
      if (action === "dryrun") body.dryRun = true;
      const res = await fetch("/api/scion/code-index/seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(errBody?.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as { jobId: string };
      setJobId(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "seed failed");
    } finally {
      setActionInFlight(null);
    }
  };

  return (
    <div className="code-index-panel">
      <h3 className="ops-section-title">Code index</h3>
      <div className="code-index-panel__stats">
        <span>
          Indexed entities: <strong>{total}</strong>
        </span>
        {countError ? (
          <span className="code-index-panel__stat-err">count unavailable</span>
        ) : null}
      </div>
      <div className="code-index-panel__actions">
        <button
          type="button"
          className="code-index-panel__button"
          onClick={() => void handleAction("seed")}
          disabled={actionInFlight !== null}
        >
          {actionInFlight === "seed" ? "Starting…" : "Re-seed"}
        </button>
        <button
          type="button"
          className="code-index-panel__button"
          onClick={() => void handleAction("reembed")}
          disabled={actionInFlight !== null}
        >
          {actionInFlight === "reembed" ? "Starting…" : "Re-embed all"}
        </button>
        <button
          type="button"
          className="code-index-panel__button"
          onClick={() => void handleAction("dryrun")}
          disabled={actionInFlight !== null}
        >
          {actionInFlight === "dryrun" ? "Starting…" : "Dry run"}
        </button>
      </div>
      {error ? <div className="scion-error-banner">{error}</div> : null}
      {jobData ? (
        <div className="code-index-panel__job">
          <div className="code-index-panel__job-header">
            <span>
              job <code>{jobData.id}</code>
            </span>
            <span className="code-index-panel__job-status">
              status={jobData.status}
            </span>
            <span>started {jobData.startedAt}</span>
            {jobData.finishedAt ? (
              <span>finished {jobData.finishedAt}</span>
            ) : null}
          </div>
          <div className="code-index-panel__job-counts">
            <span>scanned: {jobData.counts.scanned}</span>
            <span>extracted: {jobData.counts.extracted}</span>
            <span>upserted: {jobData.counts.upserted}</span>
            <span>skipped: {jobData.counts.skipped}</span>
          </div>
          {jobData.error ? (
            <div className="scion-error-banner">{jobData.error}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
