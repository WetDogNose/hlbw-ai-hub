"use client";

// Pass 21 baseline + Pass 22 operational actions.
//
// Adds:
//   - status filter pills (all / pending / in_progress / interrupted /
//     needs_human / completed / failed / cancelled).
//   - free-text search on instruction substring (case-insensitive).
//   - per-row action menu (cancel / rerun / resume / resolve / detail).
//     Destructive actions prompt via `window.confirm` before firing.
//   - optional `onOpenDetail` — if provided, "Detail" invokes the callback
//     with the clicked Issue id (used by the SCION dashboard to render
//     `<IssueDetail>` in the side panel). Falls back to the pass-21 Link.

import React, { useMemo, useState } from "react";
import { Inbox, MessageSquare } from "lucide-react";
import Link from "next/link";
import { mutate as globalMutate } from "swr";
import type { IssueWithGraphState } from "@/app/api/scion/state/route";

export interface IssueInboxProps {
  issues: IssueWithGraphState[];
  onOpenDetail?: (issueId: string) => void;
}

const FILTERS = [
  "all",
  "pending",
  "in_progress",
  "interrupted",
  "needs_human",
  "completed",
  "failed",
  "cancelled",
] as const;

type Filter = (typeof FILTERS)[number];
type SortKey = "createdAt" | "priority" | "status";

function sortIssues(
  issues: IssueWithGraphState[],
  key: SortKey,
): IssueWithGraphState[] {
  const copy = [...issues];
  switch (key) {
    case "priority":
      return copy.sort((a, b) => b.priority - a.priority);
    case "status":
      return copy.sort((a, b) => a.status.localeCompare(b.status));
    case "createdAt":
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "completed":
      return "issue-status issue-status--open";
    case "failed":
    case "blocked":
    case "cancelled":
    case "interrupted":
      return "issue-status issue-status--blocked";
    case "in_progress":
      return "issue-status issue-status--in-progress";
    default:
      return "issue-status issue-status--open";
  }
}

type IssueAction = "cancel" | "rerun" | "resume" | "resolve";

async function postAction(
  issueId: string,
  action: IssueAction,
): Promise<string | null> {
  let bodyInit: BodyInit | undefined;
  if (action === "resolve") {
    const note = window.prompt("Resolution note (required):");
    if (!note || !note.trim()) {
      return "resolve requires a note";
    }
    bodyInit = JSON.stringify({ note: note.trim() });
  }
  const res = await fetch(`/api/scion/issue/${issueId}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: bodyInit,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return body.error ?? `${action} failed: ${res.status}`;
  }
  return null;
}

const ACTION_CONFIRM: Record<IssueAction, string> = {
  cancel: "Cancel this issue? This marks the graph failed.",
  rerun: "Rerun: this creates a brand-new issue. Proceed?",
  resume: "Resume this paused issue?",
  resolve: "Flip this needs_human issue back to pending?",
};

function isActionAllowed(
  issue: IssueWithGraphState,
  action: IssueAction,
): boolean {
  switch (action) {
    case "cancel":
      return !["completed", "failed", "cancelled"].includes(issue.status);
    case "rerun":
      return true;
    case "resume":
      return (
        issue.graphState?.status === "interrupted" ||
        issue.graphState?.status === "paused"
      );
    case "resolve":
      return issue.status === "needs_human";
  }
}

export default function IssueInbox({ issues, onOpenDetail }: IssueInboxProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [search, setSearch] = useState<string>("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = issues.filter((i) => {
      if (filter !== "all") {
        if (filter === "interrupted") {
          if (i.graphState?.status !== "interrupted") return false;
        } else if (i.status !== filter) {
          return false;
        }
      }
      if (q && !i.instruction.toLowerCase().includes(q)) return false;
      return true;
    });
    return sortIssues(filtered, sortKey);
  }, [issues, filter, sortKey, search]);

  async function handleAction(
    issue: IssueWithGraphState,
    action: IssueAction,
  ): Promise<void> {
    if (!window.confirm(ACTION_CONFIRM[action])) return;
    setPendingId(issue.id);
    setLastError(null);
    const err = await postAction(issue.id, action);
    if (err) setLastError(err);
    await globalMutate("/api/scion/state");
    setPendingId(null);
  }

  return (
    <div className="orchestration-panel orchestration-panel--full">
      <h2 className="orchestration-panel__title orchestration-panel__title--inbox">
        <Inbox size={20} /> Issue Inbox
      </h2>
      <div className="issue-inbox__controls">
        <div className="issue-inbox__filters" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className={
                filter === f
                  ? "issue-inbox__filter-pill issue-inbox__filter-pill--active"
                  : "issue-inbox__filter-pill"
              }
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <label className="issue-inbox__control-label">
          Sort
          <select
            className="issue-inbox__control"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="createdAt">newest</option>
            <option value="priority">priority</option>
            <option value="status">status</option>
          </select>
        </label>
        <input
          type="search"
          className="issue-inbox__search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search instruction…"
        />
      </div>
      {lastError ? <div className="scion-error-banner">{lastError}</div> : null}
      <div className="issue-inbox">
        {visible.length === 0 ? (
          <div className="issue-inbox__empty">No matching issues.</div>
        ) : null}
        {visible.map((issue) => {
          const busy = pendingId === issue.id;
          return (
            <div key={issue.id} className="issue-row">
              <div className="issue-row__header">
                <div className="issue-row__title">
                  <MessageSquare size={16} />{" "}
                  {issue.title ?? issue.instruction.slice(0, 80)}
                </div>
                <span className={statusClass(issue.status)}>
                  {issue.status}
                </span>
              </div>
              <div className="issue-row__body">
                {issue.graphState
                  ? `node ${issue.graphState.currentNode} (${issue.graphState.status})`
                  : `priority ${issue.priority} / category ${issue.agentCategory ?? "default"}`}
              </div>
              <div className="issue-row__actions">
                {onOpenDetail ? (
                  <button
                    type="button"
                    className="issue-row__action"
                    onClick={() => onOpenDetail(issue.id)}
                  >
                    detail
                  </button>
                ) : (
                  <Link
                    href={`/scion/issue/${issue.id}`}
                    className="issue-row__action"
                  >
                    detail
                  </Link>
                )}
                {(
                  ["cancel", "rerun", "resume", "resolve"] as IssueAction[]
                ).map((a) => {
                  const allowed = isActionAllowed(issue, a);
                  if (!allowed) return null;
                  return (
                    <button
                      key={a}
                      type="button"
                      className={
                        a === "cancel"
                          ? "issue-row__action issue-row__action--danger"
                          : "issue-row__action"
                      }
                      onClick={() => void handleAction(issue, a)}
                      disabled={busy}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
