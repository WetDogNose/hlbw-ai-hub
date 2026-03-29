# Cloud Run Deployment Pipeline

The final step of the development lifecycle is deploying the agent workflow to production. For `hlbw-ai-hub`, the target infrastructure is predominantly Google Cloud Run.

## Purpose

- Automatically release merged code to GCP.
- Securely authenticate without long-lived Service Account keys.
- Build, tag, and push the final Docker image to Google Artifact Registry.
- Deploy the new revision to Cloud Run seamlessly using standard `gcloud` commands.

## How it works (Workload Identity Federation)

We do **not** use JSON credentials stored in GitHub Secrets. Instead, we use Google **Workload Identity Federation (WIF)**. GCP is configured to trust GitHub's OpenID Connect (OIDC) token for this repository, granting the GitHub Action a short-lived access token on the fly.

### Architecture Steps

1. The GitHub Action requests an OIDC token.
2. The `google-github-actions/auth` step exchanges the token for a GCP Service Account credential.
3. The Docker Action authenticates with GCP Artifact Registry and pushes the image.
4. The Action triggers `gcloud run deploy`.

## Finding the Template

- **GitHub Action**: Copy `templates/pipelines/github-actions/deploy-cloud-run.yml` into `.github/workflows/deploy-cloud-run.yml`.
- **Pre-requisites**: You must replace the placeholders inside the template (such as `<PROJECT_ID>`, `<WIF_PROVIDER>`, and `<SERVICE_ACCOUNT>`) with the actual values specific to your GCP project.
