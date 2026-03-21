# HLBW AI Hub

The **HLBW AI Hub** (`hlbw-ai-hub`) is the master orchestration and control plane repository for the HLBW ecosystem. It manages the infrastructure, deployment pipelines, AI agent toolchains, and shared configuration for child projects (such as `wot-box`).

## 🚀 Mission Function

Unlike a traditional application repository, this codebase is designed specifically to be operated by and support AI agents running locally or in GCP. It focuses on:

1. **Agent Orchestration**: Hosting the swarm management scripts and Docker templates for parallel AI task execution.
2. **Infrastructure Management**: Centralized synchronization of secrets to Google Secret Manager and deployment scripts via Cloud Build.
3. **Model Context Protocol (MCP)**: Managing the unified registry of MCP tools (Database, Cloud Logging, Tracing) securely shared among all AI workers.
4. **Environment Bootstrapping**: Standardizing the local and cloud environment configuration.

## 📁 Repository Structure

- `/.agents`: Holds the intelligent "Skills" and "Workflows" used by the Google Deepmind Antigravity Agent.
- `/.gemini`: IDE-specific settings and MCP server configurations (`mcp.json`).
- `/scripts`: The core engine room. Contains scripts for database migrations, secret syncing, and Docker swarm testing.
- `/docs`: High-level architecture and toolchain documentation.
- `hlbw-ai-hub.code-workspace`: The master VS Code workspace file that unites the Hub with child repositories.

## 🛠 Tech Stack (Orchestration context)

- **Execution**: Node.js scripts and Docker-in-Docker for isolated sub-agent workers.
- **Cloud**: Google Cloud Platform (Secret Manager, Cloud Build, Cloud Run).
- **Tooling**: Model Context Protocol (MCP) SDKs.

## ⚙️ Initial Setup

1. **Clone Repositories**: Ensure this repository lives alongside the application repositories (e.g., `../wot-box`).
2. **Open Workspace**: Open `hlbw-ai-hub.code-workspace` in VS Code.
3. **Environment**: Copy `.env.template` to `.env` and fill in the master credentials.
4. **Sync Secrets**: Use `scripts/create-secrets.ps1` to push credentials to GCP Secret Manager.

## 📚 Documentation
- [`GEMINI.md`](./GEMINI.md) - **Mandatory Reading for AI Agents** operating within this hub.
- [`GCP-DEPLOYMENT.md`](./GCP-DEPLOYMENT.md) - Cloud architecture and deployment pipeline configuration.
