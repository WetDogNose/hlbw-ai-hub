# GCP Deployment & Infrastructure (HLBW AI Hub)

The `hlbw-ai-hub` GCP project serves as the central billing and security origin for the HLBW network.

## Core Infrastructure

1. **Google Cloud Project**: `hlbw-ai-hub`
2. **Region**: `asia-southeast1` (Singapore)
3. **Cloud SQL**: Master PostgreSQL database instance (`hlbw-ai-hub-db-instance`) hosting databases for child applications.
4. **Secret Manager**: The definitive source of truth for all environment variables (`DATABASE_URL`, `GEMINI_API_KEY`, Stripe Keys, OAuth Secrets).
5. **Vertex AI**: Enabled for production-grade large language model inference.

## Secret Management

Secrets MUST NOT be hardcoded in application code or deployment yamls. 
The script `scripts/create-secrets.ps1` reads from the local `.env` and pushes the exact values to Google Secret Manager.

Applications (like `wot-box`) deployed to Cloud Run pull these secrets natively at runtime via the `--set-secrets` flag.

## Cloud Build CI/CD

The `cloudbuild.yaml` file defines the deployment steps. Note that Cloud Build will typically target child application repositories, but the pipeline is orchestrated via the configurations synced here.

When deploying a child app:
```bash
gcloud builds submit --config cloudbuild.yaml . --project hlbw-ai-hub
```

## Logs and Tracing
We utilize **OpenTelemetry** linked to **GCP Cloud Trace** and **Cloud Logging**.
Agents operating in this hub should use the `gcp-logging-mcp` and `gcp-trace-mcp` tools to inspect production anomalies natively, connected to the `hlbw-ai-hub` project.
