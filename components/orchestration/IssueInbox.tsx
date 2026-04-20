"use client";

import React, { useMemo, useState } from "react";
import { Inbox, MessageSquare } from "lucide-react";
import Link from "next/link";
import type { IssueWithGraphState } from "@/app/api/scion/state/route";

export interface IssueInboxProps {
  issues: IssueWithGraphState[];
}

const FILTERS = [
  "all",
  "pending",
  "in_progress",
  "interrupted",
  "needs_human",
  "completed",
  "failed",
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

export default function IssueInbox({ issues }: IssueInboxProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");

  const visible = useMemo(() => {
    const filtered =
      filter === "all"
        ? issues
        : issues.filter((i) => {
            if (filter === "interrupted") {
              return i.graphState?.status === "interrupted";
            }
            return i.status === filter;
          });
    return sortIssues(filtered, sortKey);
  }, [issues, filter, sortKey]);

  return (
    <div className="orchestration-panel orchestration-panel--full">
      <h2 className="orchestration-panel__title orchestration-panel__title--inbox">
        <Inbox size={20} /> Issue Inbox
      </h2>
      <div className="issue-inbox__controls">
        <label className="issue-inbox__control-label">
          Filter
          <select
            className="issue-inbox__control"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
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
      </div>
      <div className="issue-inbox">
        {visible.length === 0 ? (
          <div className="issue-inbox__empty">No matching issues.</div>
        ) : null}
        {visible.map((issue) => (
          <Link
            key={issue.id}
            href={`/admin/scion/issue/${issue.id}`}
            className="issue-inbox__link"
          >
            <div className="issue-row">
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
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
