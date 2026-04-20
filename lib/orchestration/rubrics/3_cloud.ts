// Pass 12 — Cloud-infra rubric.
//
// Applied when Issue.agentCategory === "3_cloud". Anchored to the
// cloudbuild.yaml directive: region stays `asia-southeast1`. Destructive
// infra operations (terraform destroy, gcloud run services delete, etc.)
// are rejected unless explicitly scoped. Cost must be named.

import type { Rubric } from "./types";

export const CLOUD_RUBRIC: Rubric = {
  name: "3_cloud",
  description:
    "Checks for Cloud Build, Cloud Run, Cloud SQL, and GCP infra tasks.",
  checks: [
    {
      id: "region_is_asia_southeast1",
      description:
        "Any new or modified GCP resource is pinned to region asia-southeast1 per the repo cloudbuild.yaml directive.",
    },
    {
      id: "no_destructive_infra_op",
      description:
        "Proposal does not call terraform destroy, gcloud run services delete, gcloud sql instances delete, or any equivalent without an explicit scope tag.",
    },
    {
      id: "cost_mentioned",
      description:
        "Proposal names an expected cost impact (per-invocation, per-hour, or per-month) or explicitly notes the change is zero-cost.",
    },
  ],
};
