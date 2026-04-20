"use client";

import React from "react";
import { Target } from "lucide-react";
import type { IssueWithGraphState } from "@/app/api/scion/state/route";

export interface GoalTrackerProps {
  issues: IssueWithGraphState[];
}

export default function GoalTracker({ issues }: GoalTrackerProps) {
  const total = issues.length;
  const completed = issues.filter((i) => i.status === "completed").length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div className="orchestration-panel">
      <h2 className="orchestration-panel__title orchestration-panel__title--goal">
        <Target size={20} /> Macro Progress
      </h2>
      <div className="goal-progress">
        <div className="goal-progress__label">
          {completed} / {total} completed ({percentage}%)
        </div>
        <div className="goal-progress__bar">
          <div
            className="goal-progress__fill"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      <ul className="goal-tracker">
        {issues.slice(0, 5).map((i) => (
          <li key={i.id} className="goal-tracker__item">
            <div>
              <div className="goal-tracker__label">
                {i.title ?? i.instruction.slice(0, 80)}
              </div>
              <div className="goal-tracker__meta">
                {i.status}
                {i.graphState ? ` / ${i.graphState.currentNode}` : ""}
              </div>
            </div>
          </li>
        ))}
        {issues.length === 0 ? (
          <li className="goal-tracker__item goal-tracker__item--empty">
            <div className="goal-tracker__label">No issues yet.</div>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
