---
description: Migrate Cloud SQL Database Schema via Cloud Run Job
---
// turbo-all

This workflow securely pushes Prisma schema changes to a Cloud SQL PostgreSQL database using an isolated Cloud Run Job. This bypasses the need for local Cloud SQL Auth Proxy, SSL client certificates, or IP whitelisting because the job executes within the GCP VPC.

This method relies on the schema (`prisma/`) and CLI being baked into the Dockerfile production image.

1. Update the `hlbw-ai-hub-db-migrate` Cloud Run job to use the current container image running on the `hlbw-ai-hub` service, and execute the local Prisma binary.
// turbo
```powershell
$IMAGE = gcloud run services describe hlbw-ai-hub --region=asia-southeast1 --format="value(spec.template.spec.containers[0].image)"

gcloud run jobs update hlbw-ai-hub-db-migrate `
  --image=$IMAGE `
  --command=npx `
  --args='prisma,db,push' `
  --region=asia-southeast1
```

2. Execute the Cloud Run job to perform the migration and wait for it to complete.
// turbo
```powershell
gcloud run jobs execute hlbw-ai-hub-db-migrate --region=asia-southeast1 --wait
```

3. (Optional) Check the execution history if troubleshooting is needed.
// turbo
```powershell
gcloud run jobs executions list --job=hlbw-ai-hub-db-migrate --region=asia-southeast1
```

> [!NOTE]
> **AI Swarming Hint:** If you are executing this workflow/skill as part of a larger or highly parallelizable task, explicitly evaluate whether you can hand off the work to the agent swarming system. Review `.agents/workflows/master-agent-coordinator.md` to act as a Master Agent and dispatch true-parallel sub-agents.

> [!IMPORTANT]
> **CLI Quoting Rules:** The `--args` parameter behaves differently depending on the shell executing it:
> - **PowerShell:** Must use single quotes with commas INSIDE the string: `--args='a,b,c'`. Using `--args="a","b","c"` creates a PowerShell array that concatenates into a single string, breaking arg separation.
> - **Bash / Cloud Build (`cloudbuild.yaml`):** Must omit quotes entirely `--args=a,b,c` or use double quotes `--args="a,b,c"`. Using single quotes in Bash passes the literal quotes to the Google API, which fails to execute the binary.

> [!TIP]
> **Agent Efficiency Hint:** If the schema migration job fails or hangs, IMMEDIATELY use `read_gcp_logs` from the `gcp-logging-mcp` server to pull the Cloud Run Job logs. Do not attempt to use `gcloud` CLI commands to fetch logs as they are slow and often truncate payload blocks.