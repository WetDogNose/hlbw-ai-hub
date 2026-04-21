"use client";

// SCION goals browser.
//
// Lists every Goal row with aggregate issue counts (total / completed /
// in_progress) and lets an admin create, edit, and delete goals. Admin
// gating mirrors GraphDebugPanel: SWR-fetches /api/scion/me and only
// exposes mutation controls when `role === "ADMIN"`. Viewers see the list
// but no mutation affordances.
//
// All markup uses existing SCION CSS classes — no new Tailwind / utilities.

import React, { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { Target, Plus, Trash2, Pencil } from "lucide-react";
import type { ScionMeResponse } from "@/app/api/scion/me/route";
import type {
  ScionGoalRow,
  ScionGoalsResponse,
  ScionGoalCreateResponse,
} from "@/app/api/scion/goals/route";

const GOALS_KEY = "/api/scion/goals";

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

interface GoalRowProps {
  goal: ScionGoalRow;
  isAdmin: boolean;
  busy: boolean;
  onEdit: (next: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function GoalRow({
  goal,
  isAdmin,
  busy,
  onEdit,
  onDelete,
}: GoalRowProps): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal.description);

  const beginEdit = (): void => {
    setDraft(goal.description);
    setEditing(true);
  };
  const commit = async (): Promise<void> => {
    const next = draft.trim();
    if (next.length === 0 || next === goal.description) {
      setEditing(false);
      return;
    }
    await onEdit(next);
    setEditing(false);
  };

  return (
    <div className="issue-row">
      <div className="issue-row__header">
        <div className="issue-row__title">
          <Target size={16} />
          {editing ? (
            <input
              className="issue-detail__input"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commit();
                if (e.key === "Escape") setEditing(false);
              }}
            />
          ) : (
            goal.description
          )}
        </div>
        <span className="issue-status issue-status--open">
          {goal.issueCounts.total} issue
          {goal.issueCounts.total === 1 ? "" : "s"}
        </span>
      </div>
      <div className="issue-row__body">
        {goal.issueCounts.completed} completed · {goal.issueCounts.in_progress}{" "}
        in progress · created {formatDate(goal.createdAt)}
      </div>
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

export default function GoalsBrowser(): React.ReactElement {
  const { data: me } = useSWR<ScionMeResponse>(
    "/api/scion/me",
    (url) => fetcher<ScionMeResponse>(url),
    { revalidateOnFocus: false },
  );
  const { data, error, isLoading } = useSWR<ScionGoalsResponse>(
    GOALS_KEY,
    (url) => fetcher<ScionGoalsResponse>(url),
    { refreshInterval: 10000, revalidateOnFocus: false },
  );

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const isAdmin = me?.role === "ADMIN";

  const refresh = async (): Promise<void> => {
    await globalMutate(GOALS_KEY);
  };

  const handleCreate = async (): Promise<void> => {
    const description = draft.trim();
    if (description.length === 0) {
      setLastError("description is required");
      return;
    }
    setBusyId("__new");
    setLastError(null);
    try {
      const res = await fetch(GOALS_KEY, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setLastError(body.error ?? `create failed: ${res.status}`);
        return;
      }
      const created = (await res.json()) as ScionGoalCreateResponse;
      setDraft("");
      setCreating(false);
      await refresh();
      setLastError(null);
      void created;
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "create failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleEdit = async (
    goalId: string,
    description: string,
  ): Promise<void> => {
    setBusyId(goalId);
    setLastError(null);
    try {
      const res = await fetch(`${GOALS_KEY}/${encodeURIComponent(goalId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description }),
      });
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

  const handleDelete = async (goal: ScionGoalRow): Promise<void> => {
    if (
      !window.confirm(
        `Delete goal "${goal.description}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusyId(goal.id);
    setLastError(null);
    try {
      const res = await fetch(`${GOALS_KEY}/${encodeURIComponent(goal.id)}`, {
        method: "DELETE",
      });
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

  const goals = data?.goals ?? [];

  return (
    <div className="orchestration-panel orchestration-panel--full">
      <h2 className="orchestration-panel__title orchestration-panel__title--goal">
        <Target size={20} /> Goals
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
            <Plus size={12} /> {creating ? "close" : "new goal"}
          </button>
        ) : null}
      </h2>

      {creating && isAdmin ? (
        <div className="issue-row">
          <div className="issue-row__header">
            <div className="issue-row__title">
              <input
                className="issue-detail__input"
                value={draft}
                autoFocus
                placeholder="Describe the goal (e.g. Launch Paperclip v1)"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setDraft("");
                  }
                }}
              />
            </div>
          </div>
          <div className="issue-row__actions">
            <button
              type="button"
              className="issue-row__action"
              onClick={() => void handleCreate()}
              disabled={busyId !== null || draft.trim().length === 0}
            >
              save
            </button>
            <button
              type="button"
              className="issue-row__action"
              onClick={() => {
                setCreating(false);
                setDraft("");
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
          Failed to load goals: {String((error as Error).message)}
        </div>
      ) : null}

      <div className="issue-inbox">
        {isLoading && goals.length === 0 ? (
          <div className="issue-inbox__empty">Loading goals…</div>
        ) : null}
        {!isLoading && goals.length === 0 ? (
          <div className="issue-inbox__empty">No goals yet.</div>
        ) : null}
        {goals.map((g) => (
          <GoalRow
            key={g.id}
            goal={g}
            isAdmin={isAdmin}
            busy={busyId === g.id}
            onEdit={(next) => handleEdit(g.id, next)}
            onDelete={() => handleDelete(g)}
          />
        ))}
      </div>
    </div>
  );
}
