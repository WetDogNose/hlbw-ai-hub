# Agent-to-Agent (A2A) Wrapper

The `wrappers/a2a/` directory contains a standardized interface to expose an AI Agent as a conversational peer for other agents in the `hlbw-ai-hub` swarm.

## When to Use
Use this wrapper when:
1. You have built a standalone AI agent.
2. The agent needs to receive direct instructions or requests from the **Master Agent** or other peer agents in a Multi-Agent Swarm.

## Components
- **`main.py`**: A FastAPI application defining standard endpoints for receiving messages (`/a2a/message`).
- **`A2AMessage` Schema**: Defines the standard Pydantic model for incoming requests. Ensures all agents within the ecosystem expect `sender_id`, `target_id`, `payload`, and `metadata`.

## How to Use
**CRITICAL:** This standard code wrapper is the *required* method for creating A2A agent interfaces. 
1. Use this `a2a` wrapper code as the entry point for your agent.
2. Implement your core logic inside of the `receive_message` function or import your logic as a library.
3. Your agent can now respond to swarming commands natively by taking the `payload` and processing the inputs asynchronously or synchronously depending on the implementation.

## Deployment Environment
When it is time to deploy your A2A agent, **do not write a custom deployment configuration**. Instead, you must place this wrapper and your agent code into the appropriate deployment template for your target environment:
- Use the **Docker Base Templates** (`templates/docker/`) for standalone cluster deployments.
- Use the **Cloud Run Templates** (`templates/cloud-run/`) for serverless deployments.

## Swarm Integration
This wrapper ensures compatibility with the `Master Agent Coordinator`. Standardizing on `/a2a/message` enables the master agent to broadcast tasks across the `hlbw-ai-hub` ecosystem safely and reliably.
