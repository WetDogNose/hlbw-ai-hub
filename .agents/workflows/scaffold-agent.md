---
description: How to scaffold a new standard multi-agent Agent (A2A) with proper wrappers and container templates.
---
// turbo-all
# Scaffold Agent Workflow

When you are asked to create a new AI agent within the `hlbw-ai-hub` (or `wot-box`), follow these mandatory steps to utilize the standardized ecosystem templates.

## Step 1: Base Application Scaffold
Decide if the agent should be Python or Node.js.
Copy the contents of the appropriate template to your new agent's directory:
- For standard deployment: `templates/docker/python/` or `templates/docker/node/`
- For Google Cloud Run: `templates/cloud-run/python/` or `templates/cloud-run/node/`

## Step 2: Inject the A2A Wrapper
Copy the `wrappers/a2a/` wrapper into your new agent directory. 
- Overwrite or merge your baseline `main.py` / `index.js` so that the agent utilizes the standard A2A entry point.

## Step 3: Implement Logistics
Implement the core logic of the agent under the message receiver. Ensure all standard `A2AMessage` payload shapes are respected so that it can communicate naturally with the Swarm Hub.

## Maintenance Notes
If the agent requires a unique dependency that fundamentally changes how the templates operate, immediately refer to `GEMINI.md` directives to ascertain if the root templates themselves need upgrading.
