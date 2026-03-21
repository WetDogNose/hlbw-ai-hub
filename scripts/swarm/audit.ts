// Audit Logger (Gap 7)
// Persists a durable, append-only audit trail of all swarm state transitions.

import fs from "node:fs/promises";
import path from "node:path";

const AUDIT_DIR = path.join(process.cwd(), ".agents", "swarm");
const AUDIT_PATH = path.join(AUDIT_DIR, "audit.jsonl");

export interface AuditEntry {
  timestamp: string;
  actor: string;       // "master-agent", "watchdog", "arbiter", etc.
  action: string;      // "task.created", "task.status_changed", "worker.spawned", etc.
  entityType: string;  // "task" | "worker" | "isolation"
  entityId: string;
  previousState?: string;
  newState?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function appendAudit(entry: Omit<AuditEntry, "timestamp">): Promise<void> {
  await fs.mkdir(AUDIT_DIR, { recursive: true });
  const full: AuditEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  console.log(`[AUDIT] Appending to ${path.resolve(AUDIT_PATH)}`);
  await fs.appendFile(AUDIT_PATH, JSON.stringify(full) + "\n", "utf-8");
}

export async function readAuditLog(limit = 50): Promise<AuditEntry[]> {
  try {
    const data = await fs.readFile(AUDIT_PATH, "utf-8");
    const lines = data.trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l) as AuditEntry);
  } catch {
    return [];
  }
}

// CLI usage
if (require.main === module) {
  readAuditLog(100).then((entries) => {
    console.log(JSON.stringify(entries, null, 2));
  });
}
