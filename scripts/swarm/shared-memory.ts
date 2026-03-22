// Shared Memory Client for Swarm Orchestration
// Connects to the neo4j-memory MCP server to provide a shared knowledge graph
// across all swarm agents. Each agent can read/write context, discoveries, and
// decisions that other agents can reference.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getTracer } from "./tracing";
import { appendAudit } from "./audit";
import fs from "node:fs";

const ACTOR = process.env.WORKER_ID || "shared-memory";

// --- MCP Client Connection ---

let sharedClient: Client | null = null;

async function getMemoryClient(): Promise<Client> {
  if (sharedClient) return sharedClient;

  const isContainer = fs.existsSync("/.dockerenv");
  const neo4jHost = isContainer ? "wot-box-neo4j" : "host.docker.internal";
  const dockerArgs = [
    "run", "-i", "--rm",
    "-e", `NEO4J_URL=bolt://${neo4jHost}:7687`,
    "-e", "NEO4J_USERNAME=neo4j",
    "-e", "NEO4J_PASSWORD=wotbox-swarm",
    "-e", "NEO4J_DATABASE=neo4j",
    "mcp/neo4j-memory",
  ];

  if (isContainer) {
    dockerArgs.splice(3, 0, "--network", "wot-box-network");
  }

  const transport = new StdioClientTransport({
    command: "docker",
    args: dockerArgs,
  });

  sharedClient = new Client({ name: "swarm-memory-client", version: "1.0.0" });
  await sharedClient.connect(transport);
  return sharedClient;
}

export async function closeMemoryClient(): Promise<void> {
  if (sharedClient) {
    await sharedClient.close();
    sharedClient = null;
  }
}

// --- High-Level Shared Memory API ---

/**
 * Store a swarm entity (task, worker, discovery, decision) into the shared knowledge graph.
 */
export async function storeEntity(
  name: string,
  type: "swarm_task" | "swarm_worker" | "swarm_discovery" | "swarm_decision" | "swarm_context",
  observations: string[]
): Promise<void> {
  const tracer = getTracer();
  return tracer.startActiveSpan("SharedMemory:storeEntity", async (span) => {
    span.setAttribute("entity.name", name);
    span.setAttribute("entity.type", type);
    try {
      const client = await getMemoryClient();
      await client.callTool({
        name: "create_entities",
        arguments: {
          entities: [{ name, type, observations }],
        },
      });
      await appendAudit({ actor: ACTOR, action: "memory.entity_stored", entityType: type, entityId: name, metadata: { observationCount: observations.length } });
    } catch (err: any) {
      span.recordException(err);
      console.error(`SharedMemory: Failed to store entity "${name}":`, err.message);
    } finally {
      span.end();
    }
  });
}

/**
 * Add observations/facts to an existing entity.
 */
export async function addObservations(entityName: string, observations: string[]): Promise<void> {
  try {
    const client = await getMemoryClient();
    await client.callTool({
      name: "add_observations",
      arguments: {
        observations: [{ entityName, observations }],
      },
    });
    await appendAudit({ 
      actor: ACTOR, 
      action: "memory.observations_added", 
      entityType: "observation", 
      entityId: entityName, 
      metadata: { count: observations.length, observations: observations.slice(0, 3) } 
    });
  } catch (err: any) {
    console.error(`SharedMemory: Failed to add observations to "${entityName}":`, err.message);
  }
}

/**
 * Create a relationship between two entities.
 */
export async function createRelation(source: string, target: string, relationType: string): Promise<void> {
  try {
    const client = await getMemoryClient();
    await client.callTool({
      name: "create_relations",
      arguments: {
        relations: [{ source, target, relationType }],
      },
    });
    await appendAudit({ 
      actor: ACTOR, 
      action: "memory.relation_created", 
      entityType: "relation", 
      entityId: `${source}->${target}`, 
      metadata: { source, target, relationType } 
    });
  } catch (err: any) {
    console.error(`SharedMemory: Failed to create relation ${source} -> ${target}:`, err.message);
  }
}

/**
 * Search the shared knowledge graph for relevant context.
 */
export async function searchMemory(query: string): Promise<any> {
  const tracer = getTracer();
  return tracer.startActiveSpan("SharedMemory:search", async (span) => {
    span.setAttribute("query", query);
    try {
      const client = await getMemoryClient();
      const response = await client.callTool({
        name: "search_memories",
        arguments: { query },
      });
      const result = (response as any).content?.[0]?.text;
      span.end();
      return result ? JSON.parse(result) : { entities: [], relations: [] };
    } catch (err: any) {
      span.recordException(err);
      span.end();
      return { entities: [], relations: [] };
    }
  });
}

/**
 * Find specific entities by exact name.
 */
export async function findByName(names: string[]): Promise<any> {
  try {
    const client = await getMemoryClient();
    const response = await client.callTool({
      name: "find_memories_by_name",
      arguments: { names },
    });
    const result = (response as any).content?.[0]?.text;
    return result ? JSON.parse(result) : { entities: [], relations: [] };
  } catch (err: any) {
    console.error("SharedMemory: Failed to find by name:", err.message);
    return { entities: [], relations: [] };
  }
}

/**
 * Read the entire shared knowledge graph.
 */
export async function readGraph(): Promise<any> {
  try {
    const client = await getMemoryClient();
    const response = await client.callTool({ name: "read_graph", arguments: {} });
    const result = (response as any).content?.[0]?.text;
    return result ? JSON.parse(result) : { entities: [], relations: [] };
  } catch (err: any) {
    console.error("SharedMemory: Failed to read graph:", err.message);
    return { entities: [], relations: [] };
  }
}

/**
 * Remove an entity from shared memory.
 */
export async function removeEntity(name: string): Promise<void> {
  try {
    const client = await getMemoryClient();
    await client.callTool({
      name: "delete_entities",
      arguments: { entityNames: [name] },
    });
    await appendAudit({ actor: ACTOR, action: "memory.entity_removed", entityType: "entity", entityId: name });
  } catch (err: any) {
    console.error(`SharedMemory: Failed to remove entity "${name}":`, err.message);
  }
}

// --- Swarm-Specific Convenience Functions ---

/**
 * When a task is delegated, store its context in shared memory so other agents can reference it.
 */
export async function shareTaskContext(taskId: string, title: string, description: string, branchName: string): Promise<void> {
  await storeEntity(`task:${taskId}`, "swarm_task", [
    `Title: ${title}`,
    `Description: ${description}`,
    `Branch: ${branchName}`,
    `Status: delegated`,
    `Timestamp: ${new Date().toISOString()}`,
  ]);
}

/**
 * When a worker discovers something important (e.g. a design decision, a blocker),
 * store it so other agents can see it.
 */
export async function shareDiscovery(workerId: string, taskId: string, discovery: string): Promise<void> {
  const name = `discovery:${workerId}:${Date.now()}`;
  await storeEntity(name, "swarm_discovery", [discovery, `Worker: ${workerId}`, `Task: ${taskId}`]);
  await createRelation(name, `task:${taskId}`, "DISCOVERED_DURING");
}

/**
 * Store a decision that affects other tasks or the overall project.
 */
export async function shareDecision(taskId: string, decision: string, rationale: string): Promise<void> {
  const name = `decision:${taskId}:${Date.now()}`;
  await storeEntity(name, "swarm_decision", [decision, `Rationale: ${rationale}`]);
  await createRelation(name, `task:${taskId}`, "DECIDED_FOR");
}

/**
 * Mark a task as complete and add final observations.
 */
export async function markTaskComplete(taskId: string, finalObservation: string): Promise<void> {
  const name = `task:${taskId}`;
  await addObservations(name, [`Status: completed`, `Final Result: ${finalObservation}`, `CompletedAt: ${new Date().toISOString()}`]);
}

/**
 * Before starting work, query shared memory for relevant context from other agents.
 */
export async function getSharedContext(taskTitle: string): Promise<string[]> {
  const graph = await searchMemory(taskTitle);
  const observations: string[] = [];
  if (graph.entities) {
    for (const entity of graph.entities) {
      if (entity.observations) {
        observations.push(...entity.observations.map((o: string) => `[${entity.type}:${entity.name}] ${o}`));
      }
    }
  }
  return observations;
}

// CLI usage
if (require.main === module) {
  const cmd = process.argv[2];
  const args = process.argv.slice(3);

  if (cmd === "store") {
    const [name, type, ...obs] = args;
    storeEntity(name as any, type as any, obs)
      .then(() => console.log("Entity stored."))
      .catch(console.error)
      .finally(closeMemoryClient);
  } else if (cmd === "observe") {
    const [name, ...obs] = args;
    addObservations(name, obs)
      .then(() => console.log("Observations added."))
      .catch(console.error)
      .finally(closeMemoryClient);
  } else if (cmd === "relate") {
    const [src, tgt, type] = args;
    createRelation(src, tgt, type)
      .then(() => console.log("Relation created."))
      .catch(console.error)
      .finally(closeMemoryClient);
  } else if (cmd === "search") {
    searchMemory(args[0])
      .then(r => console.log(JSON.stringify(r, null, 2)))
      .catch(console.error)
      .finally(closeMemoryClient);
  } else if (cmd === "read") {
    readGraph()
      .then(r => console.log(JSON.stringify(r, null, 2)))
      .catch(console.error)
      .finally(closeMemoryClient);
  } else {
    console.log("Usage: tsx shared-memory.ts [store|observe|relate|search|read] ...");
  }
}
