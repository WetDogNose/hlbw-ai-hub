// Pass 12 — Source-control rubric.
//
// Applied when Issue.agentCategory === "2_source_control". Checks for
// branch-name convention, commit messages that say why (not just what),
// and a hard ban on destructive history rewrites.

import type { Rubric } from "./types";

export const SOURCE_CONTROL_RUBRIC: Rubric = {
  name: "2_source_control",
  description: "Checks for git / GitHub source-control tasks.",
  checks: [
    {
      id: "branch_name_convention",
      description:
        "Proposed branch name follows the repo convention (e.g. feat/<topic>, fix/<topic>, chore/<topic>) and is kebab-case.",
    },
    {
      id: "commit_message_has_why",
      description:
        "Proposed commit message explains the why (motivation or bug root cause), not only the what of the diff.",
    },
    {
      id: "no_force_push",
      description:
        "Proposal does not use git push --force, --force-with-lease, git reset --hard on a shared branch, or any history-rewriting operation on main/master.",
    },
  ],
};
