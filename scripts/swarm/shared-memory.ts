// Pass 7 — shared memory is now a thin adapter over MemoryStore.
//
// Decisions.md D1 names Postgres + pgvector as the single episodic store.
// `PgvectorMemoryStore` is the default; `Neo4jReadAdapter` stays behind the
// `MEMORY_READ_LEGACY=1` flag so operators can read historical Neo4j data
// without unblocking writes to it. Nothing new writes to Neo4j.
//
// Every previously-exported function keeps its signature so existing callers
// (agent-runner.ts, delegate.ts, demo-memory-full.ts, watchdog.ts, …) don't
// have to change in this pass.

import { getTracer } from "./tracing";
import { appendAudit } from "./audit";
import type {
  MemoryEpisodeKind,
  MemoryStore,
} from "@/lib/orchestration/memory/MemoryStore";
import { getPgvectorMemoryStore } from "@/lib/orchestration/memory/PgvectorMemoryStore";
import { Neo4jReadAdapter } from "@/lib/orchestration/memory/Neo4jReadAdapter";

const ACTOR =
  process.env.WARM_POOL_ID || process.env.WORKER_ID || "shared-memory";

// Legacy-read flag is opt-in. Default path is pgvector-only.
const LEGACY_READ = process.env.MEMORY_READ_LEGACY === "1";

let writeStore: MemoryStore | null = null;
let readStore: MemoryStore | null = null;
let legacyReadStore: Neo4jReadAdapter | null = null;

function getWriteStore(): MemoryStore {
  if (!writeStore) writeStore = getPgvectorMemoryStore();
  return writeStore;
}

function getReadStore(): MemoryStore {
  if (!readStore) {
    readStore = LEGACY_READ
      ? (legacyReadStore ??= new Neo4jReadAdapter())
      : getPgvectorMemoryStore();
  }
  return readStore;
}

// ---- Mapping from legacy entity types to canonical kinds ---------------

type LegacyEntityType =
  | "swarm_task"
  | "swarm_worker"
  | "swarm_discovery"
  | "swarm_decision"
  | "swarm_context";

function legacyTypeToKind(type: LegacyEntityType | string): MemoryEpisodeKind {
  switch (type) {
    case "swarm_task":
      return "task_context";
    case "swarm_discovery":
      return "discovery";
    case "swarm_decision":
      return "decision";
    case "swarm_worker":
      return "entity";
    case "swarm_context":
      return "observation";
    default:
      return "entity";
  }
}

function parseTaskIdFromName(name: string): string | null {
  // Names look like `task:<id>`, `discovery:<worker>:<ts>`,
  // `decision:<taskId>:<ts>`. Only the first two forms carry a clean taskId.
  if (name.startsWith("task:")) return name.slice("task:".length);
  if (name.startsWith("decision:")) {
    const parts = name.split(":");
    return parts[1] ?? null;
  }
  return null;
}

// ---- Public API (signatures preserved) ---------------------------------

export async function closeMemoryClient(): Promise<void> {
  if (writeStore) {
    await writeStore.close();
    writeStore = null;
  }
  if (readStore && readStore !== writeStore) {
    await readStore.close();
    readStore = null;
  }
  if (legacyReadStore) {
    await legacyReadStore.close();
    legacyReadStore = null;
  }
}

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
    try {
      await getWriteStore().write({
        taskId: parseTaskIdFromName(name),
        kind: legacyTypeToKind(type),
        agentCategory: process.env.AGENT_CATEGORY ?? null,
        content: { name, type, observations },
        summary: `${name}: ${observations.join("; ")}`,
      });

      await appendAudit({
        actor: ACTOR,
        action: "memory.entity_stored",
        entityType: type,
        entityId: name,
        metadata: { observationCount: observations.length },
      });
    } catch (err) {
      span.recordException(err as Error);
      console.error(
        `SharedMemory Error (storeEntity): ${(err as Error).message}`,
      );
    } finally {
      span.end();
    }
  });
}

export async function createRelation(
  source: string,
  target: string,
  relationType: string,
): Promise<void> {
  try {
    await getWriteStore().write({
      taskId: parseTaskIdFromName(target) ?? parseTaskIdFromName(source),
      kind: "relation",
      agentCategory: process.env.AGENT_CATEGORY ?? null,
      content: { source, target, relationType },
      summary: `${source} --${relationType}--> ${target}`,
    });

    await appendAudit({
      actor: ACTOR,
      action: "memory.relation_created",
      entityType: "relation",
      entityId: `${source}->${target}`,
      metadata: { source, target, relationType },
    });
  } catch (err) {
    console.error(
      `SharedMemory Error (createRelation): ${(err as Error).message}`,
    );
  }
}

export async function addObservations(
  entityName: string,
  observations: string[],
): Promise<void> {
  try {
    await getWriteStore().write({
      taskId: parseTaskIdFromName(entityName),
      kind: "observation",
      agentCategory: process.env.AGENT_CATEGORY ?? null,
      content: { entityName, observations },
      summary: `${entityName}: ${observations.join("; ")}`,
    });

    await appendAudit({
      actor: ACTOR,
      action: "memory.observations_added",
      entityType: "observation",
      entityId: entityName,
      metadata: { count: observations.length },
    });
  } catch (err) {
    console.error(
      `SharedMemory Error (addObservations): ${(err as Error).message}`,
    );
  }
}

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
  return tracer.startActiveSpan(
    "SharedMemory:getSharedContext",
    async (span) => {
      span.setAttribute("task.title", taskTitle);
      try {
        const store = getReadStore();
        // Pull the most recent context-like episodes across kinds.
        const kinds: MemoryEpisodeKind[] = [
          "discovery",
          "decision",
          "observation",
          "task_context",
        ];
        const buckets = await Promise.all(
          kinds.map((k) => store.queryByKind(k, 10)),
        );
        const merged = buckets.flat();
        merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return merged.slice(0, 10).map((ep) => `[${ep.kind}] ${ep.summary}`);
      } catch (err) {
        span.recordException(err as Error);
        console.error(
          `SharedMemory Error (getSharedContext): ${(err as Error).message}`,
        );
        return [];
      } finally {
        span.end();
      }
    },
  );
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
      "Read via Postgres (memory_episode table) or Neo4j Browser (deprecated).",
    );
  }
}
