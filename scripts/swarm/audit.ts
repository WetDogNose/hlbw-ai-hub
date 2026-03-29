// Real-time Audit Logger (WebSocket Streamer)
// Streams swarm state transitions to the ai-memory-fragment-monitor.

// @ts-expect-error Types might not be strictly resolved
import { WebSocket } from "ws";
import fs from "node:fs";

export interface AuditEntry {
  timestamp: string;
  actor: string; // "master-agent", "watchdog", "arbiter", etc.
  action: string; // "task.created", "task.status_changed", "worker.spawned", etc.
  entityType?: string; // "task" | "worker" | "isolation"
  entityId?: string;
  previousState?: string;
  newState?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

const isContainer = fs.existsSync("/.dockerenv");
const monitorHost = isContainer ? "ai-memory-fragment-monitor" : "localhost";
const WS_URL = `ws://${monitorHost}:3000`;

let isMonitorKnownDown = false;
let lastDownTime = 0;
const RETRY_DELAY_MS = 2 * 60 * 1000; // 2 minutes

export async function appendAudit(
  entry: Omit<AuditEntry, "timestamp">,
): Promise<void> {
  const now = Date.now();

  // If we know the monitor is down, don't attempt to connect to save latency.
  // Wait until the retry window elapses to check again.
  if (isMonitorKnownDown && now - lastDownTime < RETRY_DELAY_MS) {
    return; // Silently skip
  }

  const full: AuditEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  try {
    const ws = new WebSocket(WS_URL);

    ws.on("open", () => {
      // Connection succeeded, reset the known down state
      isMonitorKnownDown = false;
      ws.send(JSON.stringify(full));
      ws.close();
    });

    ws.on("error", () => {
      // Connection failed, mark as down to suppress checks for 2 minutes
      isMonitorKnownDown = true;
      lastDownTime = Date.now();
    });
  } catch {
    isMonitorKnownDown = true;
    lastDownTime = Date.now();
  }
}
