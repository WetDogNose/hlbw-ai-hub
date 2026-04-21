"use client";

// SCION AgentPersona browser.
//
// Table view of every persona (name / role / status / assigned issues /
// tokens spent) with admin-gated inline edit + delete actions and a "New
// persona" form. Reuses the vanilla-CSS classes from `live-workers` +
// `status-pill` — no Tailwind utilities.
//
// Admin gating is a UX hint, not security: the API enforces it via
// `requireAdmin()`. Controls render for all users but error-toast on 401/403.

import React, { useState } from "react";
import useSWR from "swr";
import { Users } from "lucide-react";
import type {
  PersonaListResponse,
  PersonaListRow,
} from "@/app/api/scion/personas/route";
import type { ScionMeResponse } from "@/app/api/scion/me/route";

const fetcher = async (url: string): Promise<PersonaListResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as PersonaListResponse;
};

const meFetcher = async (url: string): Promise<ScionMeResponse | null> => {
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as ScionMeResponse;
};

const STATUS_OPTIONS = ["IDLE", "RUNNING", "PAUSED"] as const;
type PersonaStatus = (typeof STATUS_OPTIONS)[number];

function statusPillClass(status: string): string {
  switch (status) {
    case "RUNNING":
      return "status-pill status-pill--ok";
    case "PAUSED":
      return "status-pill status-pill--warn";
    case "IDLE":
    default:
      return "status-pill status-pill--neutral";
  }
}

interface EditState {
  id: string;
  role: string;
  status: PersonaStatus;
}

export default function PersonasBrowser(): React.ReactElement {
  const { data, error, isLoading, mutate } = useSWR<PersonaListResponse>(
    "/api/scion/personas",
    fetcher,
    { refreshInterval: 10_000, revalidateOnFocus: false },
  );
  const { data: me } = useSWR<ScionMeResponse | null>(
    "/api/scion/me",
    meFetcher,
    { revalidateOnFocus: false, revalidateIfStale: false },
  );
  const isAdmin = me?.role === "ADMIN";

  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);

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
      const res = await fetch("/api/scion/personas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName, role: newRole }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        flashToast(body.error ?? `create failed: ${res.status}`, true);
        return;
      }
      flashToast(`Created persona "${newName}"`);
      setNewName("");
      setNewRole("");
      await mutate();
    } catch (err: unknown) {
      flashToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setCreating(false);
    }
  }

  function beginEdit(row: PersonaListRow): void {
    const status: PersonaStatus = (
      STATUS_OPTIONS as readonly string[]
    ).includes(row.status)
      ? (row.status as PersonaStatus)
      : "IDLE";
    setEdit({ id: row.id, role: row.role, status });
  }

  async function submitEdit(): Promise<void> {
    if (!edit) return;
    setBusyId(edit.id);
    setToast(null);
    try {
      const res = await fetch(
        `/api/scion/personas/${encodeURIComponent(edit.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: edit.role, status: edit.status }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        flashToast(body.error ?? `update failed: ${res.status}`, true);
        return;
      }
      flashToast(`Persona updated`);
      setEdit(null);
      await mutate();
    } catch (err: unknown) {
      flashToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(row: PersonaListRow): Promise<void> {
    if (
      !window.confirm(`Delete persona "${row.name}"? This cannot be undone.`)
    ) {
      return;
    }
    setBusyId(row.id);
    setToast(null);
    try {
      const res = await fetch(
        `/api/scion/personas/${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          issueCount?: number;
          ledgerCount?: number;
        };
        if (res.status === 409) {
          flashToast(
            `Cannot delete — ${body.issueCount ?? 0} issue(s), ${body.ledgerCount ?? 0} ledger row(s) linked.`,
            true,
          );
        } else {
          flashToast(body.error ?? `delete failed: ${res.status}`, true);
        }
        return;
      }
      flashToast(`Deleted persona "${row.name}"`);
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
          <Users size={18} /> Agent personas ({data?.personas.length ?? 0})
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
        aria-label="New persona"
      >
        <h2 className="execute-dialog__title">
          <Users size={16} /> New persona
        </h2>
        <div className="execute-dialog__row">
          <label className="execute-dialog__label" htmlFor="persona-new-name">
            Name
            <input
              id="persona-new-name"
              className="execute-dialog__input"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. cto-owl"
              required
              disabled={!isAdmin || creating}
            />
          </label>
          <label className="execute-dialog__label" htmlFor="persona-new-role">
            Role
            <input
              id="persona-new-role"
              className="execute-dialog__input"
              type="text"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="e.g. CTO / QA / DEV"
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
            {creating ? "Creating…" : "Create persona"}
          </button>
          {!isAdmin ? (
            <span className="execute-dialog__toast execute-dialog__toast--error">
              Admin only
            </span>
          ) : null}
        </div>
      </form>

      {isLoading ? <div>Loading personas…</div> : null}
      {error ? (
        <div className="scion-error-banner">
          Failed to load personas: {String((error as Error).message)}
        </div>
      ) : null}

      {data && data.personas.length === 0 ? (
        <div className="live-workers__empty">
          No personas yet. Create one above.
        </div>
      ) : null}

      {data && data.personas.length > 0 ? (
        <table className="live-workers__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Assigned issues</th>
              <th>Tokens spent</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.personas.map((p) => {
              const isEditing = edit?.id === p.id;
              const busy = busyId === p.id;
              return (
                <tr key={p.id}>
                  <td className="config-panel__row-label">{p.name}</td>
                  <td>
                    {isEditing ? (
                      <input
                        className="execute-dialog__input"
                        type="text"
                        value={edit.role}
                        onChange={(e) =>
                          setEdit({ ...edit, role: e.target.value })
                        }
                      />
                    ) : (
                      p.role
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <select
                        className="execute-dialog__input"
                        value={edit.status}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            status: e.target.value as PersonaStatus,
                          })
                        }
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={statusPillClass(p.status)}>
                        {p.status}
                      </span>
                    )}
                  </td>
                  <td>
                    {p.assignedIssues}
                    {p.openIssues > 0 ? (
                      <>
                        {" "}
                        <span className="config-panel__row-meta">
                          ({p.openIssues} open)
                        </span>
                      </>
                    ) : null}
                  </td>
                  <td>{p.tokensSpent.toLocaleString()}</td>
                  <td className="live-workers__actions">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className="live-workers__action"
                          onClick={() => void submitEdit()}
                          disabled={busy}
                        >
                          save
                        </button>
                        <button
                          type="button"
                          className="live-workers__action"
                          onClick={() => setEdit(null)}
                          disabled={busy}
                        >
                          cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="live-workers__action"
                          onClick={() => beginEdit(p)}
                          disabled={!isAdmin || busy}
                        >
                          edit
                        </button>
                        <button
                          type="button"
                          className="live-workers__action live-workers__action--danger"
                          onClick={() => void handleDelete(p)}
                          disabled={!isAdmin || busy}
                        >
                          delete
                        </button>
                      </>
                    )}
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
