"use client";

// Pass 21 baseline + Pass 22 operational actions.
//
// Adds per-row Logs / Kill / Restart buttons (confirm-gated, admin-only at
// the API level) and a header "Restart pool" button that calls
// POST /api/scion/pool/restart and polls the job status.

import React, { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import type { ScionWorkersResponse } from "@/app/api/scion/workers/route";
import type { PoolRestartResponse } from "@/app/api/scion/pool/restart/route";
import type { PoolRestartJob } from "@/app/api/scion/pool/restart/jobs";

const fetcher = async (url: string): Promise<ScionWorkersResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as ScionWorkersResponse;
};

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

interface LogsState {
  name: string;
  text: string;
  loading: boolean;
  error: string | null;
}

interface PoolJobState {
  jobId: string;
  status: PoolRestartJob["status"];
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export default function LiveWorkers(): React.ReactElement {
  const { data, error, isLoading, mutate } = useSWR<ScionWorkersResponse>(
    "/api/scion/workers",
    fetcher,
    { refreshInterval: 3000, revalidateOnFocus: false },
  );
  const [logs, setLogs] = useState<LogsState | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [poolJob, setPoolJob] = useState<PoolJobState | null>(null);

  async function handleLogs(name: string): Promise<void> {
    setLogs({ name, text: "", loading: true, error: null });
    try {
      const res = await fetch(
        `/api/scion/workers/${encodeURIComponent(name)}/logs?tail=200`,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setLogs({
          name,
          text: "",
          loading: false,
          error: body.error ?? `request failed: ${res.status}`,
        });
        return;
      }
      const body = (await res.json()) as {
        stdout: string;
        stderr: string;
      };
      setLogs({
        name,
        text:
          (body.stdout ?? "") +
          (body.stderr ? `\n[stderr]\n${body.stderr}` : ""),
        loading: false,
        error: null,
      });
    } catch (err: unknown) {
      setLogs({
        name,
        text: "",
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleAction(
    name: string,
    action: "kill" | "restart",
  ): Promise<void> {
    const msg =
      action === "kill"
        ? `Kill container "${name}"? This terminates the running worker.`
        : `Restart container "${name}"?`;
    if (!window.confirm(msg)) return;
    setPendingName(name);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/scion/workers/${encodeURIComponent(name)}/${action}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setActionError(body.error ?? `${action} failed: ${res.status}`);
      }
      await mutate();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingName(null);
    }
  }

  async function handlePoolRestart(): Promise<void> {
    if (
      !window.confirm(
        "Restart the entire worker pool? All warm workers are terminated and respawned.",
      )
    )
      return;
    try {
      const res = await fetch("/api/scion/pool/restart", { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | PoolRestartResponse
        | { error?: string; jobId?: string }
        | null;
      if (!res.ok || !body || !("jobId" in body) || !body.jobId) {
        setActionError(
          (body && "error" in body ? body.error : null) ??
            `pool restart failed: ${res.status}`,
        );
        return;
      }
      const initial: PoolJobState = {
        jobId: body.jobId,
        status: "status" in body ? body.status : "running",
        startedAt:
          "startedAt" in body ? body.startedAt : new Date().toISOString(),
      };
      setPoolJob(initial);
      void pollPoolJob(body.jobId);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function pollPoolJob(jobId: string): Promise<void> {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(
          `/api/scion/pool/restart/${encodeURIComponent(jobId)}`,
        );
        if (!res.ok) continue;
        const body = (await res.json()) as PoolRestartJob;
        setPoolJob({
          jobId: body.id,
          status: body.status,
          startedAt: body.startedAt,
          finishedAt: body.finishedAt,
          error: body.error,
        });
        if (body.status === "completed" || body.status === "failed") break;
      } catch {
        // keep polling
      }
    }
    await mutate();
  }

  if (isLoading) {
    return <div className="live-workers">Loading workers…</div>;
  }
  if (error || !data) {
    return (
      <div className="live-workers">
        <div className="scion-error-banner">
          Failed to load workers:{" "}
          {String((error as Error | undefined)?.message)}
        </div>
      </div>
    );
  }
  return (
    <div className="live-workers">
      <div className="live-workers__header">
        <h3 className="ops-section-title">
          Live workers ({data.workers.length})
        </h3>
        <button
          type="button"
          className="live-workers__pool-btn"
          onClick={handlePoolRestart}
        >
          Restart pool
        </button>
      </div>
      {actionError ? (
        <div className="scion-error-banner">{actionError}</div>
      ) : null}
      {poolJob ? (
        <div className="live-workers__pool-job">
          Pool job {poolJob.jobId}: {poolJob.status}
          {poolJob.finishedAt ? ` (finished ${poolJob.finishedAt})` : ""}
          {poolJob.error ? ` — ${poolJob.error}` : ""}
        </div>
      ) : null}
      {data.workers.length === 0 ? (
        <div className="live-workers__empty">
          No running worker containers (Docker absent or no matches).
        </div>
      ) : (
        <table className="live-workers__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Status</th>
              <th>Uptime</th>
              <th>Issue</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.workers.map((w) => {
              const ok = w.status === "running";
              const pillClass = ok
                ? "status-pill status-pill--ok"
                : "status-pill status-pill--warn";
              const busy = pendingName === w.name;
              return (
                <tr key={w.containerId}>
                  <td className="config-panel__row-label">{w.name}</td>
                  <td>{w.category ?? "-"}</td>
                  <td>
                    <span className={pillClass}>{w.status}</span>
                  </td>
                  <td>{formatUptime(w.uptimeSeconds)}</td>
                  <td>
                    {w.currentIssueId ? (
                      <Link href={`/scion/issue/${w.currentIssueId}`}>
                        {w.currentIssueId}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="live-workers__actions">
                    <button
                      type="button"
                      className="live-workers__action"
                      onClick={() => void handleLogs(w.name)}
                      disabled={busy}
                    >
                      logs
                    </button>
                    <button
                      type="button"
                      className="live-workers__action live-workers__action--danger"
                      onClick={() => void handleAction(w.name, "kill")}
                      disabled={busy}
                    >
                      kill
                    </button>
                    <button
                      type="button"
                      className="live-workers__action"
                      onClick={() => void handleAction(w.name, "restart")}
                      disabled={busy}
                    >
                      restart
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {logs ? (
        <div className="live-workers__logs">
          <div className="live-workers__logs-header">
            <span className="config-panel__row-label">Logs: {logs.name}</span>
            <button
              type="button"
              className="live-workers__action"
              onClick={() => setLogs(null)}
            >
              close
            </button>
          </div>
          {logs.loading ? (
            <div>Fetching…</div>
          ) : logs.error ? (
            <div className="scion-error-banner">{logs.error}</div>
          ) : (
            <pre className="live-workers__logs-pre">
              {logs.text || "(no output)"}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  );
}
