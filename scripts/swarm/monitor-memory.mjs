// Swarm Memory Real-Time Monitor (ESM)
// Tails multiple audit logs and displays shared memory updates visually.

import fs from "node:fs";
import path from "node:path";
import { globSync } from "glob";

// Use forward slashes for glob compatibility
const ROOT = process.cwd().replace(/\\/g, "/");
const MAIN_AUDIT_PATH = `${ROOT}/.agents/swarm/audit.jsonl`;
const WORKTREE_ROOT = path.join(ROOT, "..", "wot-box-worktrees").replace(/\\/g, "/");
const WORKTREE_AUDIT_GLOB = `${WORKTREE_ROOT}/*/.agents/swarm/audit.jsonl`;

const COLORS = {
  RESET: "\x1b[0m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  BLUE: "\x1b[34m",
  CYAN: "\x1b[36m",
  MAGENTA: "\x1b[35m",
  RED: "\x1b[31m",
  DIM: "\x1b[2m",
  BOLD: "\x1b[1m",
};

const auditFiles = new Map(); // path -> lastSize

const processLine = (line, filePath) => {
  if (!line.trim()) return;
  try {
    const entry = JSON.parse(line);
    if (!entry.action || !entry.action.startsWith("memory.")) return;

    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : "??:??:??";
    
    // Determine origin tag
    let originTag = "[MAIN]";
    const normalizedPath = filePath.replace(/\\/g, "/");
    if (normalizedPath !== MAIN_AUDIT_PATH) {
      const parts = normalizedPath.split("/");
      const worktreeIndex = parts.indexOf("wot-box-worktrees");
      if (worktreeIndex !== -1 && parts[worktreeIndex + 1]) {
        originTag = `[${parts[worktreeIndex + 1]}]`;
      } else {
        // Fallback to basename of parent directory
        originTag = `[${path.basename(path.dirname(path.dirname(path.dirname(filePath))))}]`;
      }
    }
    
    let message = "";

    switch (entry.action) {
      case "memory.entity_stored":
        message = `${COLORS.GREEN}[CREATED]${COLORS.RESET} Entity: ${COLORS.BOLD}${COLORS.CYAN}${entry.entityId}${COLORS.RESET} (${entry.entityType})`;
        if (entry.metadata?.observationCount) {
          message += ` with ${entry.metadata.observationCount} initial facts`;
        }
        break;
      case "memory.relation_created":
        const { source, target, relationType } = entry.metadata || {};
        message = `${COLORS.BLUE}[LINKED]${COLORS.RESET} ${COLORS.BOLD}${source}${COLORS.RESET} --[${COLORS.MAGENTA}${relationType}${COLORS.RESET}]--> ${COLORS.BOLD}${target}${COLORS.RESET}`;
        break;
      case "memory.observations_added":
        message = `${COLORS.YELLOW}[UPDATED]${COLORS.RESET} Entity: ${COLORS.BOLD}${COLORS.CYAN}${entry.entityId}${COLORS.RESET} added ${COLORS.BOLD}${entry.metadata?.count || 1}${COLORS.RESET} observations`;
        if (entry.metadata?.observations && entry.metadata.observations.length > 0) {
          message += ` ${COLORS.DIM}("${entry.metadata.observations[0].substring(0, 40)}...")${COLORS.RESET}`;
        }
        break;
      case "memory.entity_removed":
        message = `${COLORS.RED}[REMOVED]${COLORS.RESET} Entity: ${COLORS.BOLD}${entry.entityId}${COLORS.RESET}`;
        break;
      default:
        message = `${COLORS.DIM}[${entry.action}]${COLORS.RESET} ${entry.entityId}`;
    }

    console.log(`${COLORS.DIM}[${time}]${COLORS.RESET} ${COLORS.MAGENTA}${originTag}${COLORS.RESET} ${message}`);
  } catch (err) {
    // Ignore invalid JSON lines
  }
};

function updateAuditFiles() {
  const files = [];
  if (fs.existsSync(MAIN_AUDIT_PATH)) files.push(MAIN_AUDIT_PATH);
  
  try {
    const worktreeFiles = globSync(WORKTREE_AUDIT_GLOB);
    for (const f of worktreeFiles) {
      files.push(f.replace(/\\/g, "/"));
    }
  } catch (err) {
    // Silence glob errors
  }

  for (const f of files) {
    if (!auditFiles.has(f)) {
      const stats = fs.statSync(f);
      auditFiles.set(f, stats.size);
      
      // On discovery, show last few lines if it's not empty
      if (stats.size > 0) {
        const content = fs.readFileSync(f, "utf8");
        content.split("\n").filter(Boolean).slice(-10).forEach(line => processLine(line, f));
      }
    }
  }
}

function clearScreen() {
  process.stdout.write("\x1bc");
}

function printHeader() {
  console.log(`${COLORS.BOLD}${COLORS.CYAN}╔═══════════════════════════════════════════════════════════════╗${COLORS.RESET}`);
  console.log(`${COLORS.BOLD}${COLORS.CYAN}║             SWARM MEMORY REAL-TIME MONITOR                    ║${COLORS.RESET}`);
  console.log(`${COLORS.BOLD}${COLORS.CYAN}╚═══════════════════════════════════════════════════════════════╝${COLORS.RESET}`);
  console.log(`${COLORS.DIM}Main: ${MAIN_AUDIT_PATH}${COLORS.RESET}`);
  console.log(`${COLORS.DIM}Glob: ${WORKTREE_AUDIT_GLOB}${COLORS.RESET}\n`);
}

clearScreen();
printHeader();
updateAuditFiles();

console.log(`${COLORS.DIM}--- Swarm Knowledge Stream (Polling Active) ---${COLORS.RESET}\n`);

let heartbeat = 0;
const heartbeatChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

setInterval(() => {
  try {
    updateAuditFiles();
    
    for (const [filePath, lastSize] of auditFiles.entries()) {
      if (!fs.existsSync(filePath)) {
        auditFiles.delete(filePath);
        continue;
      }
      
      const stats = fs.statSync(filePath);
      if (stats.size > lastSize) {
        const fd = fs.openSync(filePath, "r");
        const buffer = Buffer.alloc(stats.size - lastSize);
        fs.readSync(fd, buffer, 0, stats.size - lastSize, lastSize);
        fs.closeSync(fd);
        
        const newContent = buffer.toString("utf-8");
        newContent.split("\n").filter(Boolean).forEach(line => processLine(line, filePath));
        
        auditFiles.set(filePath, stats.size);
      } else if (stats.size < lastSize) {
        // File truncated
        console.log(`${COLORS.DIM}[SYSTEM]${COLORS.RESET} Log truncated: ${path.basename(filePath)}`);
        auditFiles.set(filePath, stats.size);
      }
    }
    
    // Heartbeat
    process.stdout.write(`\r${COLORS.CYAN}${heartbeatChars[heartbeat % heartbeatChars.length]}${COLORS.RESET} Monitoring ${auditFiles.size} logs...`);
    heartbeat++;
  } catch (err) {
    // Handle race conditions
  }
}, 500);

// Handle Ctrl+C
process.on("SIGINT", () => {
  console.log(`\n\n${COLORS.CYAN}Monitor stopped.${COLORS.RESET}`);
  process.exit();
});
