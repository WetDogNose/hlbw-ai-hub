---
name: Home Assistant Integrator
description: Autonomously bridges edits made to the local Home Assistant configuration repository (`hlbw-home-assistant`) with the live smart home instance via the `7_automation` MCP Sub-Agent.
---

# Home Assistant Integrator Instructions

This skill directs how AI agents should safely interact with the `hlbw-home-assistant` repository to modify, validate, and test the smart home YAML configurations.

## 1. Domain Knowledge

- The `hlbw-home-assistant` repository (`C:\Users\Jason\repos\hlbw-home-assistant`) holds the source of truth for the live Home Assistant instance's configuration.
- The Live Home Assistant instance is exposed to AI Agents solely through the `home-assistant` MCP server.
- Following the Hub-and-Spoke Swarm architecture limit mitigations, the IDE Master Agent does **not** have the Home Assistant MCP tools pre-loaded. They are strictly isolated to the `7_automation` namespace.

## 2. Live Instance Capabilities (MCP)

The `home-assistant` MCP Server provides you with the capability to:
- Read live entity states and historical telemetry.
- List available domains, services, and entities (lights, switches, sensors, etc.).
- Trigger live scripts or automations for validation.

## 3. The Validation & Query Workflow

When you need to interact with the live instance (e.g. finding the correct `entity_id` before writing an automation, or validating a script works), you MUST spawn a Swarm Sub-Agent to perform the query on your behalf.

```powershell
npx tsx scripts/swarm/docker-worker.ts "ha-query" "master" "Use the Home Assistant MCP tools to list all light entities in the living room and check their current status." ts "7_automation"
```

## 4. Strict Modification Rules

- **Don't Guess Entity IDs:** Always query the live instance (via a `7_automation` Sub-Agent) for the exact `entity_id` before writing it into an `automations.yaml` or `scripts.yaml` file.
- **Physical Safety First:** Use extreme caution when dealing with automations that control physical hardware (heaters, garage doors, locks). 
- **Secret Isolation:** Treat `secrets.yaml` as completely off-limits and read-only unless the user provides explicit authorization.

## 5. Documentation Reference

Home Assistant is actively developed and frequently changes its syntax or configuration specifications. 

To find up-to-date and highly specific information regarding how to configure Home Assistant integrations, entities, and automations, you **MUST** navigate to the official documentation site using web browser tools to research before assuming syntax:
**URL:** [https://www.home-assistant.io/docs/](https://www.home-assistant.io/docs/)
