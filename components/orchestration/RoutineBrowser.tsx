"use client";

// SCION routines browser.
//
// Lists every Routine row (cron expression, last run, isActive, task payload)
// and lets an admin create, edit, toggle, and delete rows. Admin gating
// mirrors GraphDebugPanel / GoalsBrowser: SWR-fetches /api/scion/me and only
// exposes mutation controls when `role === "ADMIN"`. Viewers see the list
// but no mutation affordances.
//
// All markup uses existing SCION CSS classes — no new Tailwind / utilities.

import React, { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { Clock, Plus, Trash2, Pencil } from "lucide-react";
import type { ScionMeResponse } from "@/app/api/scion/me/route";
import type {
  ScionRoutineRow,
  ScionRoutinesResponse,
} from "@/app/api/scion/routines/route";

const ROUTINES_KEY = "/api/scion/routines";

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function prettyPayload(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

interface RoutineRowProps {
  routine: ScionRoutineRow;
  isAdmin: boolean;
  busy: boolean;
  onToggleActive: (next: boolean) => Promise<void>;
  onEdit: (patch: {
    cronExpression?: string;
    taskPayload?: string;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}

function RoutineRow({
  routine,
  isAdmin,
  busy,
  onToggleActive,
  onEdit,
  onDelete,
}: RoutineRowProps): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [cronDraft, setCronDraft] = useState(routine.cronExpression);
  const [payloadDraft, setPayloadDraft] = useState(
    prettyPayload(routine.taskPayload),
  );
  const [expanded, setExpanded] = useState(false);

  const beginEdit = (): void => {
    setCronDraft(routine.cronExpression);
    setPayloadDraft(prettyPayload(routine.taskPayload));
    setEditing(true);
  };

  const commit = async (): Promise<void> => {
    const patch: { cronExpression?: string; taskPayload?: string } = {};
    const nextCron = cronDraft.trim();
    if (nextCron.length > 0 && nextCron !== routine.cronExpression) {
      patch.cronExpression = nextCron;
    }
    const nextPayload = payloadDraft.trim();
    if (nextPayload.length > 0 && nextPayload !== routine.taskPayload) {
      patch.taskPayload = nextPayload;
    }
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    await onEdit(patch);
    setEditing(false);
  };

  return (
    <div className="issue-row">
      <div className="issue-row__header">
        <div className="issue-row__title">
          <Clock size={16} />
          {editing ? (
            <input
              className="issue-detail__input"
              value={cronDraft}
              autoFocus
              placeholder="minute hour dom month dow"
              onChange={(e) => setCronDraft(e.target.value)}
            />
          ) : (
            <code>{routine.cronExpression}</code>
          )}
        </div>
        <span
          className={
            routine.isActive
              ? "issue-status issue-status--open"
              : "issue-status"
          }
        >
          {routine.isActive ? "active" : "paused"}
        </span>
      </div>
      <div className="issue-row__body">
        last run {formatDateTime(routine.lastRunAt)} · updated{" "}
        {formatDateTime(routine.updatedAt)}
      </div>

      {editing ? (
        <textarea
          className="issue-detail__textarea"
          rows={6}
          value={payloadDraft}
          onChange={(e) => setPayloadDraft(e.target.value)}
          placeholder='{"agentName":"...","instruction":"..."}'
        />
      ) : (
        <button
          type="button"
          className="issue-row__action"
          onClick={() => setExpanded((v) => !v)}
          disabled={busy}
        >
          {expanded ? "hide payload" : "show payload"}
        </button>
      )}
      {!editing && expanded ? (
        <pre className="issue-detail__textarea">
          {prettyPayload(routine.taskPayload)}
        </pre>
      ) : null}

      {isAdmin ? (
        <div className="issue-row__actions">
          {editing ? (
            <>
              <button
                type="button"
                className="issue-row__action"
                onClick={() => void commit()}
                disabled={busy}
              >
                save
              </button>
              <button
                type="button"
                className="issue-row__action"
                onClick={() => setEditing(false)}
                disabled={busy}
              >
                cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="issue-row__action"
                onClick={() => void onToggleActive(!routine.isActive)}
                disabled={busy}
              >
                {routine.isActive ? "pause" : "resume"}
              </button>
              <button
                type="button"
                className="issue-row__action"
                onClick={beginEdit}
                disabled={busy}
              >
                <Pencil size={12} /> edit
              </button>
              <button
                type="button"
                className="issue-row__action issue-row__action--danger"
                onClick={() => void onDelete()}
                disabled={busy}
              >
                <Trash2 size={12} /> delete
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function RoutineBrowser(): React.ReactElement {
  const { data: me } = useSWR<ScionMeResponse>(
    "/api/scion/me",
    (url) => fetcher<ScionMeResponse>(url),
    { revalidateOnFocus: false },
  );
  const { data, error, isLoading } = useSWR<ScionRoutinesResponse>(
    ROUTINES_KEY,
    (url) => fetcher<ScionRoutinesResponse>(url),
    { refreshInterval: 10000, revalidateOnFocus: false },
  );

  const [creating, setCreating] = useState(false);
  const [cronDraft, setCronDraft] = useState("");
  const [payloadDraft, setPayloadDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const isAdmin = me?.role === "ADMIN";

  const refresh = async (): Promise<void> => {
    await globalMutate(ROUTINES_KEY);
  };

  const handleCreate = async (): Promise<void> => {
    const cronExpression = cronDraft.trim();
    const payload = payloadDraft.trim();
    if (cronExpression.length === 0) {
      setLastError("cronExpression is required");
      return;
    }
    if (payload.length === 0) {
      setLastError("taskPayload is required");
      return;
    }
    setBusyId("__new");
    setLastError(null);
    try {
      const res = await fetch(ROUTINES_KEY, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cronExpression, taskPayload: payload }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setLastError(body.error ?? `create failed: ${res.status}`);
        return;
      }
      setCronDraft("");
      setPayloadDraft("");
      setCreating(false);
      await refresh();
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "create failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (
    routine: ScionRoutineRow,
    nextActive: boolean,
  ): Promise<void> => {
    setBusyId(routine.id);
    setLastError(null);
    try {
      const res = await fetch(
        `${ROUTINES_KEY}/${encodeURIComponent(routine.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isActive: nextActive }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setLastError(body.error ?? `toggle failed: ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "toggle failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleEdit = async (
    routineId: string,
    patch: { cronExpression?: string; taskPayload?: string },
  ): Promise<void> => {
    setBusyId(routineId);
    setLastError(null);
    try {
      const res = await fetch(
        `${ROUTINES_KEY}/${encodeURIComponent(routineId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setLastError(body.error ?? `update failed: ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "update failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (routine: ScionRoutineRow): Promise<void> => {
    if (
      !window.confirm(
        `Delete routine \`${routine.cronExpression}\`? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusyId(routine.id);
    setLastError(null);
    try {
      const res = await fetch(
        `${ROUTINES_KEY}/${encodeURIComponent(routine.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setLastError(body.error ?? `delete failed: ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const routines = data?.routines ?? [];

  return (
    <div className="orchestration-panel orchestration-panel--full">
      <h2 className="orchestration-panel__title">
        <Clock size={20} /> Routines
        {isAdmin ? (
          <button
            type="button"
            className="issue-row__action"
            onClick={() => {
              setCreating((v) => !v);
              setLastError(null);
            }}
            disabled={busyId !== null}
          >
            <Plus size={12} /> {creating ? "close" : "new routine"}
          </button>
        ) : null}
      </h2>

      {creating && isAdmin ? (
        <div className="issue-row">
          <div className="issue-row__header">
            <div className="issue-row__title">
              <input
                className="issue-detail__input"
                value={cronDraft}
                autoFocus
                placeholder="*/5 * * * *"
                onChange={(e) => setCronDraft(e.target.value)}
              />
            </div>
          </div>
          <textarea
            className="issue-detail__textarea"
            rows={6}
            value={payloadDraft}
            onChange={(e) => setPayloadDraft(e.target.value)}
            placeholder='{"agentName":"my-agent","instruction":"what to do"}'
          />
          <div className="issue-row__actions">
            <button
              type="button"
              className="issue-row__action"
              onClick={() => void handleCreate()}
              disabled={
                busyId !== null ||
                cronDraft.trim().length === 0 ||
                payloadDraft.trim().length === 0
              }
            >
              save
            </button>
            <button
              type="button"
              className="issue-row__action"
              onClick={() => {
                setCreating(false);
                setCronDraft("");
                setPayloadDraft("");
              }}
              disabled={busyId !== null}
            >
              cancel
            </button>
          </div>
        </div>
      ) : null}

      {lastError ? <div className="scion-error-banner">{lastError}</div> : null}
      {error ? (
        <div className="scion-error-banner">
          Failed to load routines: {String((error as Error).message)}
        </div>
      ) : null}

      <div className="issue-inbox">
        {isLoading && routines.length === 0 ? (
          <div className="issue-inbox__empty">Loading routines…</div>
        ) : null}
        {!isLoading && routines.length === 0 ? (
          <div className="issue-inbox__empty">No routines yet.</div>
        ) : null}
        {routines.map((r) => (
          <RoutineRow
            key={r.id}
            routine={r}
            isAdmin={isAdmin}
            busy={busyId === r.id}
            onToggleActive={(next) => handleToggleActive(r, next)}
            onEdit={(patch) => handleEdit(r.id, patch)}
            onDelete={() => handleDelete(r)}
          />
        ))}
      </div>
    </div>
  );
}
