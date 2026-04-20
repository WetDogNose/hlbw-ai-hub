// Pass 7 — deprecated Neo4j read-only MemoryStore adapter.
//
// Per decisions.md D1 the canonical memory store is Postgres + pgvector.
// This adapter exists so any historical Neo4j data can still be served to
// callers that opt in via `MEMORY_READ_LEGACY=1`. All write methods throw —
// new episodes MUST go through `PgvectorMemoryStore`.
//
// SDK signature (`neo4j.driver`, `driver.session`, `session.run`) verified
// against the `neo4j-driver@^6.0.1` dependency pinned in package.json.

import neo4j, { Driver } from "neo4j-driver";
import fs from "node:fs";
import type {
  MemoryStore,
  MemoryEpisode,
  MemoryEpisodeKind,
  MemoryEpisodeSimilarity,
  SimilarityQueryOptions,
  WriteEpisodeInput,
} from "./MemoryStore";

const DEPRECATION_MSG =
  "Neo4jReadAdapter is read-only (Pass 7, decisions.md D1). " +
  "Route writes through PgvectorMemoryStore.";

function resolveNeo4jUrl(): string {
  if (process.env.NEO4J_URL) return process.env.NEO4J_URL;
  const isContainer = fs.existsSync("/.dockerenv");
  return isContainer ? "bolt://hlbw-neo4j:7687" : "bolt://localhost:7687";
}

// Map a legacy Neo4j `Memory.type` back onto the canonical MemoryEpisodeKind.
// Unknown legacy types fall through to 'observation' as the safest superset.
function legacyTypeToKind(legacyType: string): MemoryEpisodeKind {
  switch (legacyType) {
    case "swarm_task":
      return "task_context";
    case "swarm_discovery":
      return "discovery";
    case "swarm_decision":
      return "decision";
    case "swarm_context":
      return "observation";
    default:
      return "entity";
  }
}

function kindToLegacyType(kind: MemoryEpisodeKind): string {
  switch (kind) {
    case "task_context":
      return "swarm_task";
    case "discovery":
      return "swarm_discovery";
    case "decision":
      return "swarm_decision";
    case "observation":
      return "swarm_context";
    default:
      return kind;
  }
}

export class Neo4jReadAdapter implements MemoryStore {
  private driver: Driver | null = null;

  private getDriver(): Driver {
    if (!this.driver) {
      this.driver = neo4j.driver(
        resolveNeo4jUrl(),
        neo4j.auth.basic(
          process.env.NEO4J_USER ?? "neo4j",
          process.env.NEO4J_PASS ?? "wotbox-swarm",
        ),
      );
    }
    return this.driver;
  }

  async write(ep: WriteEpisodeInput): Promise<string> {
    void ep;
    throw new Error(DEPRECATION_MSG);
  }

  async queryByTask(
    taskId: string,
    limit: number = 50,
  ): Promise<MemoryEpisode[]> {
    const session = this.getDriver().session();
    try {
      const query = `
        MATCH (n:Memory)
        WHERE n.name = $taskNode OR n.name STARTS WITH $prefix
        RETURN n.name AS name, n.type AS type, n.observations AS observations
        ORDER BY n.name DESC
        LIMIT toInteger($limit)
      `;
      const res = await session.run(query, {
        taskNode: `task:${taskId}`,
        prefix: `${taskId}:`,
        limit,
      });
      return res.records.map((rec) => {
        const name = rec.get("name") as string;
        const type = rec.get("type") as string;
        const observations = (rec.get("observations") as string[]) ?? [];
        return {
          id: `neo4j:${name}`,
          taskId,
          kind: legacyTypeToKind(type),
          agentCategory: null,
          content: { observations, name },
          summary: observations.join("; "),
          createdAt: new Date(0),
        };
      });
    } finally {
      await session.close();
    }
  }

  async queryByKind(
    kind: MemoryEpisodeKind,
    limit: number = 50,
  ): Promise<MemoryEpisode[]> {
    const legacyType = kindToLegacyType(kind);
    const session = this.getDriver().session();
    try {
      const query = `
        MATCH (n:Memory)
        WHERE n.type = $legacyType
        RETURN n.name AS name, n.type AS type, n.observations AS observations
        ORDER BY n.name DESC
        LIMIT toInteger($limit)
      `;
      const res = await session.run(query, { legacyType, limit });
      return res.records.map((rec) => {
        const name = rec.get("name") as string;
        const observations = (rec.get("observations") as string[]) ?? [];
        return {
          id: `neo4j:${name}`,
          taskId: null,
          kind,
          agentCategory: null,
          content: { observations, name },
          summary: observations.join("; "),
          createdAt: new Date(0),
        };
      });
    } finally {
      await session.close();
    }
  }

  async queryBySimilarity(
    embedding: number[],
    opts: SimilarityQueryOptions = {},
  ): Promise<MemoryEpisodeSimilarity[]> {
    void embedding;
    void opts;
    // Legacy graph had no vector index; similarity search is unsupported.
    throw new Error(`${DEPRECATION_MSG} queryBySimilarity is pgvector-only.`);
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }
}
