# Hub-and-Spoke Swarm Architecture

## Overview

The Hub-and-Spoke Swarm Architecture is an evolution of Wot-Box's core AI toolchain orchestration. As Wot-Box grew to integrate dozens of external dependencies, cloud environments, and complex tools via the Model Context Protocol (MCP), it hit a critical architectural barrier: modern IDE extensions (and many LLM contexts) enforce strict limits on the maximum quantity of available functional tools (typically capping at 100). 

To solve this and introduce better security domains, the monolithic root agent was split into a **Master Orchestrator (Hub)** and distinct, isolated **Sub-Agents (Spokes)** that each carry a subset of specialized MCP capabilities. 

## Architectural Design

### 1. Master Agent (Hub)
The IDE environment runs identically to a "Master Orchestrator." 
Instead of loading every tool across the workspace (e.g., test runners, database queries, and log parsers all at once), the Master Agent only loads tools related to **planning, editing, memory, and orchestration**. 

**Primary Responsibilities:**
- Code implementation and source editing.
- Interfacing directly with the developer via chat.
- Spawning Ephemeral Docker Sub-Agents using the `scripts/swarm/docker-worker.ts` pipeline when specialized tools are needed.
- Consolidating work via the Shared Neo4j Memory graph.

### 2. Specialized Sub-Agents (Spokes)
Specialized tools are relocated to containerized configuration files, mapped to an exact 9-category taxonomy. 

When a Sub-Agent is spawned, it does not inherit the Master Agent's configuration. Instead, `scripts/swarm/docker-worker.ts` dynamically binds the category-specific `mcp_config.json` file into the container via Docker volume mounts. The Sub-Agent wakes up fully dedicated to its specialized domain.

## Taxonomy Scale

The architecture is strictly divided into the following isolated namespaces, stored in `tools/docker-gemini-cli/configs/<category>/mcp_config.json`:

* **`0_master`**: The orchestrator configuration. Exists at the IDE root. 
* **`1_qa`**: Quality Assurance. Contains tools for test execution (`run_unit_tests`, `run_db_tests`, `run_type_checks`, etc).
* **`2_source_control`**: Deep repository management, remote fetching, and PR reviews.
* **`3_cloud`**: Cloud infrastructure monitoring (GCP Logging, GCP Trace, deployments).
* **`4_db`**: Database operations and proxy connections (Postgres raw queries, Prisma administration).
* **`5_bizops`**: Business, billing, and operational metrics (e.g., Stripe API).
* **`6_project_specific`**: Transient capabilities dedicated strictly to dynamic or newly active project modules.
* **`7_automation`**: Home Assistant controls and smart home automation workflows.
* **`8_reserved`**: Unallocated.

## Spawning Sub-Agents

Agents must *actively* delegate complex or isolated operations to these specific spoke categories by utilizing the Master Orchestrator workflow (`.agents/workflows/master-agent-coordinator.md`).

To provision a Swarm Sub-Agent, use the built-in Wot-Box Swarm scripts:

```bash
npx tsx scripts/swarm/docker-worker.ts spawn <taskId> <branch> "Detailed instructions" ts "1_qa"
```

> [!TIP]  
> **Dynamic Injection**  
> Notice the trailing `"1_qa"` argument. This signals the Docker Worker script to inject `tools/docker-gemini-cli/configs/category-1-qa/mcp_config.json` into the ephemeral sub-agent.

## Best Practices & Security Boundaries

1. **No Monolithic Leaks:** Never attempt to install heavy, specialized tools (e.g., `postgres-mcp-server`) into the root IDE `mcp_config.json`. Doing so leaks testing or production credentials into the general development context and wastes the 100-tool limit globally.
2. **Context Passing:** Sub-agents only know what they are told in the `<instructions>`. Make sure to provide explicit details (or instruct the sub-agent to retrieve information from Neo4j Shared Memory) before unleashing them.
3. **Database Security:** `4_db` sub-agents must adhere to read-only proxies unless specifically granted write access, isolating production triage from standard code modification.
4. **Testing Paradigms:** App Testers (`1_qa`) should be spawned natively via background worker nodes. This allows the Master Agent to continue drafting the next feature while the `1_qa` Node executes slow E2E suites.
