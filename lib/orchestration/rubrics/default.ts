// Pass 12 — Default rubric (fallback when agentCategory is null or unknown).
//
// Moved from `scripts/swarm/roles/rubrics/default.ts` per PLAN.md §3 Pass 12.
// The 3 baseline checks are identical to pass 11's placeholder.

import type { Rubric } from "./types";

export const DEFAULT_RUBRIC: Rubric = {
  name: "default",
  description: "Baseline sanity checks for any tool call or plan proposal.",
  checks: [
    {
      id: "progress",
      description: "Does the proposal advance the task, not restate it?",
    },
    {
      id: "grounded",
      description:
        "Is every claim (file path, symbol, command) verifiable against provided context?",
    },
    {
      id: "minimal",
      description: "Is the proposed action minimal (no speculative extras)?",
    },
  ],
};
