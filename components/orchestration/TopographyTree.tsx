"use client";

import React from "react";
import { Server, Activity } from "lucide-react";
import type { IssueWithGraphState } from "@/app/api/scion/state/route";

export interface TopographyTreeProps {
  issues: IssueWithGraphState[];
  workerCounts?: {
    running: number;
    paused: number;
    interrupted: number;
    completed: number;
    failed: number;
  };
}

const STATUS_ORDER = [
  "in_progress",
  "pending",
  "blocked",
  "needs_human",
  "failed",
  "cancelled",
  "completed",
];

function groupByStatus(
  issues: IssueWithGraphState[],
): Record<string, IssueWithGraphState[]> {
  const out: Record<string, IssueWithGraphState[]> = {};
  for (const i of issues) {
    const k = i.status;
    if (!out[k]) out[k] = [];
    out[k].push(i);
  }
  return out;
}

export default function TopographyTree({
  issues,
  workerCounts,
}: TopographyTreeProps) {
  const grouped = groupByStatus(issues);
  const orderedKeys = [
    ...STATUS_ORDER.filter((k) => grouped[k]),
    ...Object.keys(grouped).filter((k) => !STATUS_ORDER.includes(k)),
  ];

  return (
    <div className="orchestration-panel">
      <h2 className="orchestration-panel__title orchestration-panel__title--info">
        <Server size={20} /> Agent Topography
      </h2>
      {workerCounts ? (
        <div className="topography-summary">
          <span className="topography-summary__chip">
            running: {workerCounts.running}
          </span>
          <span className="topography-summary__chip">
            paused: {workerCounts.paused}
          </span>
          <span className="topography-summary__chip">
            interrupted: {workerCounts.interrupted}
          </span>
          <span className="topography-summary__chip">
            completed: {workerCounts.completed}
          </span>
          <span className="topography-summary__chip">
            failed: {workerCounts.failed}
          </span>
        </div>
      ) : null}
      <div className="topography-tree">
        {orderedKeys.length === 0 ? (
          <div className="topography-empty">No issues yet.</div>
        ) : null}
        {orderedKeys.map((status) => (
          <div key={status} className="topography-group">
            <div className="topography-group__header">{status}</div>
            <div className="topography-group__children">
              {grouped[status].map((issue) => (
                <div key={issue.id} className="topography-node">
                  <Activity className="topography-node__icon--info" />
                  <div className="topography-node__body">
                    <div className="topography-node__label">
                      {issue.title ?? issue.id}
                    </div>
                    <div className="topography-node__meta">
                      {issue.graphState
                        ? `node: ${issue.graphState.currentNode}`
                        : `category: ${issue.agentCategory ?? "default"}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
