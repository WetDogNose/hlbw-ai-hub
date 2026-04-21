"use client";

// SCION WebhookConfig browser.
//
// Table of every webhook row (name / endpoint / isActive / secret preview)
// with:
//   - click-to-toggle isActive (PATCH)
//   - per-row Test button (POST /api/scion/webhooks/[id]/test) with inline
//     status/duration display
//   - per-row Delete (confirm-gated)
//   - "New webhook" inline form
//
// Admin gating is a UX hint; the API enforces it via requireAdmin(). Controls
// render for non-admins but the call will 401/403 and toast.
//
// Vanilla CSS only — reuses live-workers + execute-dialog + status-pill
// classes.

import React, { useState } from "react";
import useSWR from "swr";
import { Webhook } from "lucide-react";
import type {
  WebhookListResponse,
  WebhookListRow,
} from "@/app/api/scion/webhooks/route";
import type { WebhookTestResponse } from "@/app/api/scion/webhooks/[id]/test/route";
import type { ScionMeResponse } from "@/app/api/scion/me/route";

const fetcher = async (url: string): Promise<WebhookListResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as WebhookListResponse;
};

const meFetcher = async (url: string): Promise<ScionMeResponse | null> => {
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as ScionMeResponse;
};

function truncateMiddle(text: string, max = 40): string {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

interface TestResultState {
  status: number;
  durationMs: number;
  snippet: string;
  error: string | null;
  at: number;
}

export default function WebhookBrowser(): React.ReactElement {
  const { data, error, isLoading, mutate } = useSWR<WebhookListResponse>(
    "/api/scion/webhooks",
    fetcher,
    { refreshInterval: 15_000, revalidateOnFocus: false },
  );
  const { data: me } = useSWR<ScionMeResponse | null>(
    "/api/scion/me",
    meFetcher,
    { revalidateOnFocus: false, revalidateIfStale: false },
  );
  const isAdmin = me?.role === "ADMIN";

  const [newName, setNewName] = useState("");
  const [newEndpoint, setNewEndpoint] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);
  const [testResults, setTestResults] = useState<
    Record<string, TestResultState>
  >({});

  function flashToast(msg: string, isError = false): void {
    setToast(msg);
    setToastError(isError);
  }

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setToast(null);
    try {
      const res = await fetch("/api/scion/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: newName,
          endpoint: newEndpoint,
          secret: newSecret,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        flashToast(body.error ?? `create failed: ${res.status}`, true);
        return;
      }
      flashToast(`Created webhook "${newName}"`);
      setNewName("");
      setNewEndpoint("");
      setNewSecret("");
      await mutate();
    } catch (err: unknown) {
      flashToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(row: WebhookListRow): Promise<void> {
    setBusyId(row.id);
    setToast(null);
    try {
      const res = await fetch(
        `/api/scion/webhooks/${encodeURIComponent(row.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isActive: !row.isActive }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        flashToast(body.error ?? `toggle failed: ${res.status}`, true);
        return;
      }
      flashToast(
        `Webhook "${row.name}" ${row.isActive ? "disabled" : "enabled"}`,
      );
      await mutate();
    } catch (err: unknown) {
      flashToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusyId(null);
    }
  }

  async function handleTest(row: WebhookListRow): Promise<void> {
    setBusyId(row.id);
    setToast(null);
    try {
      const res = await fetch(
        `/api/scion/webhooks/${encodeURIComponent(row.id)}/test`,
        { method: "POST" },
      );
      const body = (await res
        .json()
        .catch(() => ({}))) as WebhookTestResponse & {
        error?: string;
      };
      if (!res.ok) {
        flashToast(body.error ?? `test failed: ${res.status}`, true);
        return;
      }
      setTestResults((prev) => ({
        ...prev,
        [row.id]: {
          status: body.status,
          durationMs: body.durationMs,
          snippet: body.responseSnippet,
          error: body.error ?? null,
          at: Date.now(),
        },
      }));
    } catch (err: unknown) {
      flashToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(row: WebhookListRow): Promise<void> {
    if (
      !window.confirm(`Delete webhook "${row.name}"? This cannot be undone.`)
    ) {
      return;
    }
    setBusyId(row.id);
    setToast(null);
    try {
      const res = await fetch(
        `/api/scion/webhooks/${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        flashToast(body.error ?? `delete failed: ${res.status}`, true);
        return;
      }
      flashToast(`Deleted webhook "${row.name}"`);
      await mutate();
    } catch (err: unknown) {
      flashToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="live-workers">
      <div className="live-workers__header">
        <h3 className="ops-section-title">
          <Webhook size={18} /> Webhooks ({data?.webhooks.length ?? 0})
        </h3>
      </div>

      {toast ? (
        <div
          className={
            toastError ? "scion-error-banner" : "live-workers__pool-job"
          }
        >
          {toast}
        </div>
      ) : null}

      <form
        className="execute-dialog"
        onSubmit={handleCreate}
        aria-label="New webhook"
      >
        <h2 className="execute-dialog__title">
          <Webhook size={16} /> New webhook
        </h2>
        <div className="execute-dialog__row">
          <label className="execute-dialog__label" htmlFor="webhook-new-name">
            Name
            <input
              id="webhook-new-name"
              className="execute-dialog__input"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. ops-notify"
              required
              disabled={!isAdmin || creating}
            />
          </label>
          <label
            className="execute-dialog__label"
            htmlFor="webhook-new-endpoint"
          >
            Endpoint
            <input
              id="webhook-new-endpoint"
              className="execute-dialog__input"
              type="url"
              value={newEndpoint}
              onChange={(e) => setNewEndpoint(e.target.value)}
              placeholder="https://hooks.example.com/..."
              required
              disabled={!isAdmin || creating}
            />
          </label>
          <label className="execute-dialog__label" htmlFor="webhook-new-secret">
            Secret (min 16 chars)
            <input
              id="webhook-new-secret"
              className="execute-dialog__input"
              type="password"
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value)}
              placeholder="shared HMAC secret"
              minLength={16}
              required
              disabled={!isAdmin || creating}
            />
          </label>
        </div>
        <div className="execute-dialog__footer">
          <button
            type="submit"
            className="execute-dialog__submit"
            disabled={!isAdmin || creating}
          >
            {creating ? "Creating…" : "Create webhook"}
          </button>
          {!isAdmin ? (
            <span className="execute-dialog__toast execute-dialog__toast--error">
              Admin only
            </span>
          ) : null}
        </div>
      </form>

      {isLoading ? <div>Loading webhooks…</div> : null}
      {error ? (
        <div className="scion-error-banner">
          Failed to load webhooks: {String((error as Error).message)}
        </div>
      ) : null}

      {data && data.webhooks.length === 0 ? (
        <div className="live-workers__empty">
          No webhooks configured. Create one above.
        </div>
      ) : null}

      {data && data.webhooks.length > 0 ? (
        <table className="live-workers__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Endpoint</th>
              <th>Secret</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.webhooks.map((w) => {
              const busy = busyId === w.id;
              const result = testResults[w.id];
              return (
                <tr key={w.id}>
                  <td className="config-panel__row-label">{w.name}</td>
                  <td title={w.endpoint}>{truncateMiddle(w.endpoint, 40)}</td>
                  <td>
                    <code className="config-panel__row-meta">
                      {w.secretPreview}
                    </code>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={
                        w.isActive
                          ? "status-pill status-pill--ok"
                          : "status-pill status-pill--warn"
                      }
                      onClick={() => void handleToggleActive(w)}
                      disabled={!isAdmin || busy}
                      aria-label={
                        w.isActive ? "Disable webhook" : "Enable webhook"
                      }
                    >
                      {w.isActive ? "active" : "inactive"}
                    </button>
                  </td>
                  <td className="live-workers__actions">
                    <button
                      type="button"
                      className="live-workers__action"
                      onClick={() => void handleTest(w)}
                      disabled={!isAdmin || busy}
                    >
                      test
                    </button>
                    <button
                      type="button"
                      className="live-workers__action live-workers__action--danger"
                      onClick={() => void handleDelete(w)}
                      disabled={!isAdmin || busy}
                    >
                      delete
                    </button>
                    {result ? (
                      <div className="config-panel__row-meta">
                        {result.error ? (
                          <span>
                            error: {result.error} · {result.durationMs}ms
                          </span>
                        ) : (
                          <span>
                            status {result.status} · {result.durationMs}ms
                          </span>
                        )}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
