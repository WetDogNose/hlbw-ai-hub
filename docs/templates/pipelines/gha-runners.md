# GitHub Actions Runners Guidance

By default, all pipelines within the `hlbw-ai-hub` use GitHub's standard, managed runners (`runs-on: ubuntu-latest`). These environments provide excellent baseline compute without the administrative overhead of managing underlying Virtual Machines.

## Standard Runners (`ubuntu-latest`)
**When to use:**
- Building and pushing Docker images to Artifact Registry.
- Running standard node/python unit tests via `npm test` or `pytest`.
- Deploying to Cloud Run via Workload Identity Federation.
- Almost all day-to-day CI/CD tasks.

**Why:** Zero configuration, highly secure, and instantly horizontally scalable.

## Self-Hosted Runners on GCP
Sometimes, standard GitHub runners are insufficient. You may need to deploy a **Self-Hosted Runner** in Google Cloud Platform (e.g., a Compute Engine VM acting as a runner).

**When to use Self-Hosted:**
1. **Specialized Hardware**: Your agent workflow requires executing a local testing suite that runs a heavy LLM inference natively on a GPU. Standard GHA runners do not have GPUs.
2. **Strict VPC Access Restrictions**: Your integration tests must connect directly to a private Cloud SQL database or internal VPC network that cannot be exposed to the public internet, meaning the CI runner itself must live inside the same GCP Virtual Private Cloud.
3. **Heavy Compute Duration**: If tests require excessive memory (>16GB RAM) or run for many hours.

### Getting Started with Self-Hosted
*(Note: If you fall into the categories above, you will need to provision a GCP VM instance, download the GitHub Actions Runner binary, register it to the repository, and assign it tags like `runs-on: [self-hosted, gcp-gpu]`. Follow the official [GitHub Docs](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners) for setup instructions.)*
