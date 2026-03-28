---
name: Containerized Gemini CLI Directive
description: Explains how an agent must interact with and build the Gemini CLI docker execution environment.
---

# Agent Directive: Containerized Gemini Executions

Whenever tasked with running, building, testing, or connecting to the `gemini-cli` environment within this repository, **you must explicitly adhere to the container paradigm.**

## Rule 1: Never run the gemini-cli locally
DO NOT run `gemini-cli` in your host terminal. You must interact with it via the host MCP integration wrapping the `docker-compose` container.

## Rule 2: Building and Orchestrating 
If asked to build the CLI environment tailored with specific MCP layers (e.g., github):
1. Use `cd tools/docker-gemini-cli`.
2. Run `./build.sh <layer1> <layer2> ...`.
3. Orchestrate with `docker compose up -d --build`.

## Rule 3: The API Token
The environment is strictly **zero-config**. You are NOT permitted to touch or manage the `GEMINI_API_KEY` within the docker configuration files. The `docker-compose.yml` explicitly pipes the host `../../.env` tokens safely to the container.

## Rule 4: Host MCP Wrapper Integration
If tasked with orchestrating jobs on the running container, utilize the wrapper in `tools/docker-gemini-cli/mcp-wrapper`. 
This is compiled via `npm run build` and invoked by executing `node dist/index.js`, providing you native MCP RPC access to run isolated CLI commands safely using `docker exec`.
