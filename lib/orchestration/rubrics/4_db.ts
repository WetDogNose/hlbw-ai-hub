// Pass 12 — Database-migration rubric.
//
// Applied when Issue.agentCategory === "4_db". Migrations are user-gated
// (PLAN.md rule 11). The rubric enforces additive-only schema changes,
// explicit backfills, and hard rejection of --accept-data-loss.

import type { Rubric } from "./types";

export const DB_RUBRIC: Rubric = {
  name: "4_db",
  description:
    "Checks for Prisma / Postgres schema-migration and data-backfill tasks.",
  checks: [
    {
      id: "migration_additive_only",
      description:
        "Proposed migration is additive: new columns are nullable or have defaults, drops are staged (deprecate then remove in a later pass), renames use a paired add+copy+drop sequence.",
    },
    {
      id: "backfill_explicit",
      description:
        "If the migration requires populating existing rows, the proposal includes an explicit backfill query or script, not an unstated assumption that defaults suffice.",
    },
    {
      id: "no_accept_data_loss",
      description:
        "Proposal never passes --accept-data-loss to prisma db push; never uses prisma migrate reset on a populated database.",
    },
  ],
};
