# CI/CD Pipelines and Agent Workflows

The `hlbw-ai-hub` leverages continuous integration and deployment (CI/CD) to ensure that agent workflows are robust, tested, and shipped securely. This repository utilizes **GitHub Actions** as the primary pipeline orchestrator.

## Pipeline Environments

We categorize our pipelines into three distinct target workflows, each serving a specific phase of the development lifecycle:

1. **[Local / CI Pull Request Validation](./pipelines/ci-validation.md)**
   Used to run formatting, linting, and fast unit tests natively (Node.js/Python) on every Push or Pull Request. Ensures code quality before it hits the `main` branch.

2. **[Docker Build & Testing](./pipelines/docker-build.md)**
   Used to construct production Docker images to verify syntactic correctness and occasionally to run full integration tests (using `docker-compose`) inside the GitHub Actions runner.

3. **[Cloud Run Deployment](./pipelines/cloud-run-deployment.md)**
   The fully automated production release pipeline. Utilizes Google Cloud Workload Identity Federation to securely push docker containers to Artifact Registry and deploy them to Cloud Run.

## GitHub Actions Runners

For the vast majority of our workloads, we rely on standard **GitHub-Hosted Runners** (e.g., `ubuntu-latest`). They are free, zero-maintenance, and highly capable.

Before considering custom runner infrastructure, please read our [Guidance on GHA Runners](./pipelines/gha-runners.md) to determine if your agent workflow requires setting up self-hosted compute.

## Using the Templates

You can find the raw `.yml` GitHub Actions templates inside the `templates/pipelines/github-actions/` directory. By dropping these files into `.github/workflows/` at the root of the repository, you instantly activate the pipeline.
