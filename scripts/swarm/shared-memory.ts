// Shared Memory Client for Swarm Orchestration
// Uses native neo4j-driver for direct communication (Docker-compatible).
// This allows both Hub and Spokes to write to the knowledge graph without sidecars.

import neo4j, { Driver } from "neo4j-driver";
import { getTracer } from "./tracing";
import { appendAudit } from "./audit";
import fs from "node:fs";

const ACTOR =
  process.env.WARM_POOL_ID || process.env.WORKER_ID || "shared-memory";

// --- Database Configuration ---

const isContainer = fs.existsSync("/.dockerenv");
const NEO4J_URL =
  process.env.NEO4J_URL ||
  (isContainer ? "bolt://hlbw-neo4j:7687" : "bolt://localhost:7687");
const NEO4J_USER = "neo4j";
const NEO4J_PASS = "wotbox-swarm";

let driver: Driver | null = null;

function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  }
  return driver;
}

export async function closeMemoryClient(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

// --- High-Level Shared Memory API ---

/**
 * Store a swarm entity (task, worker, discovery, decision) into the shared knowledge graph.
 */
export async function storeEntity(
  name: string,
  type:
    | "swarm_task"
    | "swarm_worker"
    | "swarm_discovery"
    | "swarm_decision"
    | "swarm_context",
  observations: string[],
): Promise<void> {
  const tracer = getTracer();
  return tracer.startActiveSpan("SharedMemory:storeEntity", async (span) => {
    span.setAttribute("entity.name", name);
    span.setAttribute("entity.type", type);
    const session = getDriver().session();
    try {
      // Cypher: Create node with Memory label and specific type label
      const query = `
        MERGE (n:Memory {name: $name})
        SET n.type = $type, n.observations = $observations
        WITH n
        CALL apoc.create.addLabels(n, [$type]) YIELD node
        RETURN node
      `;
      await session.run(query, { name, type, observations });

      await appendAudit({
        actor: ACTOR,
        action: "memory.entity_stored",
        entityType: type,
        entityId: name,
        metadata: { observationCount: observations.length },
      });
    } catch (err: any) {
      span.recordException(err);
      console.error(`SharedMemory Error (storeEntity): ${err.message}`);
    } finally {
      await session.close();
      span.end();
    }
  });
}

/**
 * Create a relationship between two entities.
 */
export async function createRelation(
  source: string,
  target: string,
  relationType: string,
): Promise<void> {
  const session = getDriver().session();
  try {
    const query = `
      MATCH (a:Memory {name: $source})
      MATCH (b:Memory {name: $target})
      MERGE (a)-[r:RELATION {type: $relationType}]->(b)
      RETURN r
    `;
    await session.run(query, { source, target, relationType });

    await appendAudit({
      actor: ACTOR,
      action: "memory.relation_created",
      entityType: "relation",
      entityId: `${source}->${target}`,
      metadata: { source, target, relationType },
    });
  } catch (err: any) {
    console.error(`SharedMemory Error (createRelation): ${err.message}`);
  } finally {
    await session.close();
  }
}

/**
 * Add observations/facts to an existing entity.
 */
export async function addObservations(
  entityName: string,
  observations: string[],
): Promise<void> {
  const session = getDriver().session();
  try {
    const query = `
      MATCH (n:Memory {name: $entityName})
      SET n.observations = n.observations + $observations
      RETURN n
    `;
    await session.run(query, { entityName, observations });

    await appendAudit({
      actor: ACTOR,
      action: "memory.observations_added",
      entityType: "observation",
      entityId: entityName,
      metadata: { count: observations.length },
    });
  } catch (err: any) {
    console.error(`SharedMemory Error (addObservations): ${err.message}`);
  } finally {
    await session.close();
  }
}

// --- Swarm-Specific Convenience Functions ---

export async function shareTaskContext(
  taskId: string,
  title: string,
  description: string,
  branchName: string,
): Promise<void> {
  await storeEntity(`task:${taskId}`, "swarm_task", [
    `Title: ${title}`,
    `Description: ${description}`,
    `Branch: ${branchName}`,
    `Status: delegated`,
    `Timestamp: ${new Date().toISOString()}`,
  ]);
}

export async function shareDiscovery(
  workerId: string,
  taskId: string,
  discovery: string,
): Promise<void> {
  const name = `discovery:${workerId}:${Date.now()}`;
  await storeEntity(name, "swarm_discovery", [
    discovery,
    `Worker: ${workerId}`,
    `Task: ${taskId}`,
  ]);
  await createRelation(name, `task:${taskId}`, "DISCOVERED_DURING");
}

export async function shareDecision(
  taskId: string,
  decision: string,
  rationale: string,
): Promise<void> {
  const name = `decision:${taskId}:${Date.now()}`;
  await storeEntity(name, "swarm_decision", [
    decision,
    `Rationale: ${rationale}`,
  ]);
  await createRelation(name, `task:${taskId}`, "DECIDED_FOR");
}

export async function getSharedContext(taskTitle: string): Promise<string[]> {
  const tracer = getTracer();
  return tracer.startActiveSpan("SharedMemory:getSharedContext", async (span) => {
    span.setAttribute("task.title", taskTitle);
    const session = getDriver().session();
    try {
      const query = `
        MATCH (n:Memory)
        WHERE n.type IN ['swarm_discovery', 'swarm_decision', 'swarm_context']
        RETURN n.name AS name, n.observations AS observations
        ORDER BY n.name DESC
        LIMIT 10
      `;
      const result = await session.run(query, {});
      const context: string[] = [];
      for (const record of result.records) {
        const name = record.get("name");
        const obs = record.get("observations") as string[];
        if (obs && obs.length > 0) {
          context.push(`[${name}]: ${obs.join("; ")}`);
        }
      }
      return context;
    } catch (err: any) {
      span.recordException(err);
      console.error(`SharedMemory Error (getSharedContext): ${err.message}`);
      return [];
    } finally {
      await session.close();
      span.end();
    }
  });
}

export async function markTaskComplete(
  taskId: string,
  finalObservation: string,
): Promise<void> {
  const name = `task:${taskId}`;
  await addObservations(name, [
    `Status: completed`,
    `Final Result: ${finalObservation}`,
    `CompletedAt: ${new Date().toISOString()}`,
  ]);
}

// Minimal CLI compatibility for now
if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === "read") {
    console.log(
      "Read via Neo4j Browser or specialized scripts. Native driver active.",
    );
  }
}
