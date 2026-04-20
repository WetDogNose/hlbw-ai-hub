// Pass 12 — Business-operations rubric.
//
// Applied when Issue.agentCategory === "5_bizops". These tasks rarely
// touch code — they touch processes, stakeholders, and metrics. The
// rubric enforces that the proposal names a stakeholder, a success
// metric, and a rollback plan.

import type { Rubric } from "./types";

export const BIZOPS_RUBRIC: Rubric = {
  name: "5_bizops",
  description:
    "Checks for business-ops tasks (process, stakeholder, metric, rollout).",
  checks: [
    {
      id: "stakeholder_identified",
      description:
        "Proposal names the human stakeholder(s) who own the outcome (by role or email), not just an abstract team.",
    },
    {
      id: "success_metric_named",
      description:
        "Proposal names the metric that will tell us it worked (KPI, dashboard, specific query) and its target value.",
    },
    {
      id: "rollback_plan_sketched",
      description:
        "Proposal sketches a rollback path: how to undo the change and within what time budget.",
    },
  ],
};
