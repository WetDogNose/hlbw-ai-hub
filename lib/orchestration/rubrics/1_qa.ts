// Pass 12 — QA-category rubric.
//
// Applied when Issue.agentCategory === "1_qa". Checks are QA-specific so
// the Critic rewards proposals that write tests rather than assertions in
// prose, that cite the failing test path, and that reason about flakiness.

import type { Rubric } from "./types";

export const QA_RUBRIC: Rubric = {
  name: "1_qa",
  description: "Checks for QA / test-writing tasks.",
  checks: [
    {
      id: "proposes_test_not_assertion",
      description:
        "Proposal adds or edits an executable test (Jest / Pytest file), not a prose assertion in a README or comment.",
    },
    {
      id: "cites_failing_test_path",
      description:
        "Proposal cites the absolute or repo-relative path of the failing test it is fixing or the new test file it is adding.",
    },
    {
      id: "flakiness_risk_assessed",
      description:
        "Proposal explicitly addresses flakiness risk: time sources mocked, network calls stubbed, random seeds pinned, or notes that none apply.",
    },
  ],
};
