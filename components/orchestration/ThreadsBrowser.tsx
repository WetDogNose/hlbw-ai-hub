"use client";

// SCION threads browser.
//
// Paginated list of Thread rows via /api/scion/threads with cursor pagination.
// Each row shows title + issue count + last-activity timestamp. Clicking a
// row expands to show the thread's issues (accordion). Includes a "New
// thread" form that POSTs to /api/scion/threads (admin-only).

import React, { useState } from "react";
import useSWR, { mutate } from "swr";
import { MessageSquare } from "lucide-react";
import type {
  ScionThreadsResponse,
  ThreadRow,
} from "@/app/api/scion/threads/route";
import type { ThreadDetailResponse } from "@/app/api/scion/threads/[id]/route";

const listFetcher = async (url: string): Promise<ScionThreadsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as ScionThreadsResponse;
};

const detailFetcher = async (url: string): Promise<ThreadDetailResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as ThreadDetailResponse;
};

function ThreadIssues({ threadId }: { threadId: string }): React.ReactElement {
  const { data, error, isLoading } = useSWR<ThreadDetailResponse>(
    `/api/scion/threads/${encodeURIComponent(threadId)}`,
    detailFetcher,
    { revalidateOnFocus: false },
  );

  if (isLoading) return <div className="threads-browser__empty">Loading…</div>;
  if (error)
    return (
      <div className="scion-error-banner">
        Failed to load thread:{" "}
        {String((error as Error | undefined)?.message ?? "unknown")}
      </div>
    );
  if (!data || data.issues.length === 0)
    return (
      <div className="threads-browser__empty">No issues in this thread.</div>
    );

  return (
    <div className="threads-browser__issues">
      {data.issues.map((issue) => (
        <div key={issue.id} className="threads-browser__issue">
          <div className="threads-browser__issue-header">
            <span>
              <MessageSquare size={14} />{" "}
              {issue.title ?? issue.instruction.slice(0, 80)}
            </span>
            <span className="threads-browser__issue-status">
              {issue.status}
            </span>
          </div>
          <div className="threads-browser__issue-meta">
            priority {issue.priority} · created{" "}
            {new Date(issue.createdAt).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ThreadsBrowser(): React.ReactElement {
  const [cursor, setCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newTitle, setNewTitle] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const qs = new URLSearchParams();
  qs.set("limit", "25");
  if (cursor) qs.set("cursor", cursor);
  const swrKey = `/api/scion/threads?${qs.toString()}`;

  const { data, error, isLoading } = useSWR<ScionThreadsResponse>(
    swrKey,
    listFetcher,
    { revalidateOnFocus: false },
  );

  const handleCreate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      setCreateError("title required");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/scion/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setCreateError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      setNewTitle("");
      void mutate(swrKey);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "create failed");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (row: ThreadRow): Promise<void> => {
    const ok = window.confirm(
      `Delete thread "${row.title}"? This cannot be undone.`,
    );
    if (!ok) return;
    setDeleting(row.id);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/api/scion/threads/${encodeURIComponent(row.id)}`,
        { method: "DELETE" },
      );
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
    <div className="threads-browser">
      <h3 className="ops-section-title">Threads</h3>

      <form className="threads-browser__new-form" onSubmit={handleCreate}>
        <input
          type="text"
          className="threads-browser__new-input"
          placeholder="New thread title…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          disabled={creating}
        />
        <button
          type="submit"
          className="threads-browser__button"
          disabled={creating || newTitle.trim().length === 0}
        >
          {creating ? "Creating…" : "New thread"}
        </button>
      </form>
      {createError ? (
        <div className="scion-error-banner">Create failed: {createError}</div>
      ) : null}
      {deleteError ? (
        <div className="scion-error-banner">Delete failed: {deleteError}</div>
      ) : null}

      <div className="threads-browser__controls">
        <div className="threads-browser__pagination">
          <button
            className="threads-browser__button"
            type="button"
            disabled={cursor === null}
            onClick={() => setCursor(null)}
          >
            Reset
          </button>
          <button
            className="threads-browser__button"
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

      {isLoading ? <div>Loading threads…</div> : null}
      {error ? (
        <div className="scion-error-banner">
          Failed to load threads:{" "}
          {String((error as Error | undefined)?.message)}
        </div>
      ) : null}

      {data && data.rows.length === 0 ? (
        <div className="threads-browser__empty">No threads yet.</div>
      ) : null}

      {data?.rows.map((row) => {
        const isOpen = Boolean(expanded[row.id]);
        const isDeleting = deleting === row.id;
        return (
          <div key={row.id} className="threads-browser__row">
            <div className="threads-browser__row-header">
              <button
                type="button"
                className="threads-browser__row-toggle"
                aria-expanded={isOpen}
                onClick={() =>
                  setExpanded((prev) => ({ ...prev, [row.id]: !isOpen }))
                }
              >
                <span className="threads-browser__row-title">
                  {isOpen ? "▾" : "▸"} {row.title}
                </span>
                <span className="threads-browser__row-meta">
                  <span className="threads-browser__badge">
                    {row.issueCount} issue{row.issueCount === 1 ? "" : "s"}
                  </span>
                  <span className="threads-browser__timestamp">
                    {new Date(row.lastActivityAt).toLocaleString()}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="threads-browser__delete"
                onClick={() => void handleDelete(row)}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
            <div className="threads-browser__row-id">
              <code>{row.id}</code>
            </div>
            {isOpen ? <ThreadIssues threadId={row.id} /> : null}
          </div>
        );
      })}
    </div>
  );
}
