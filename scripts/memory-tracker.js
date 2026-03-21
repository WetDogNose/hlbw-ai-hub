// Tracks system memory and process usage before and after executing a specified command, generating a detailed comparative report to a log file.

const os = require("os");
const { execSync } = require("child_process");
const spawn = require("cross-spawn");
const fs = require("fs");
const path = require("path");

const TRACKED_SYSTEM_APPS = ["Antigravity", "node", "vmmemWSL", "docker", "postgres", "language_server"];

function getSystemMemory() {
    return {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem()
    };
}

function getAllProcesses() {
    try {
        if (os.platform() === "win32") {
            // Get all processes (Select-Object removes the first line blank padding issues sometimes)
            const output = execSync('powershell "@(Get-Process | Select-Object Name, Id, WorkingSet) | ConvertTo-Json -Depth 1"', { encoding: "utf-8", maxBuffer: 1024 * 1024 * 10 });
            const pData = JSON.parse(output);
            const procs = Array.isArray(pData) ? pData : [pData];
            
            return procs.map(p => ({
                name: p.Name,
                pid: p.Id,
                memory: p.WorkingSet || 0
            })).filter(p => p.memory > 0);
        } else {
            // works on most posix-like (linux/mac)
            const output = execSync("ps -o comm,pid,rss -A", { encoding: "utf-8", maxBuffer: 1024 * 1024 * 10 });
            const lines = output.trim().split("\n").slice(1); // skip header
            return lines.map(line => {
                const parts = line.trim().split(/\s+/).filter(Boolean);
                if (parts.length < 3) return null;
                const rss = parseInt(parts[parts.length - 1], 10);
                const pid = parseInt(parts[parts.length - 2], 10);
                const comm = parts.slice(0, parts.length - 2).join(" ");
                if (isNaN(rss) || isNaN(pid)) return null;
                return {
                    name: comm,
                    pid: pid,
                    memory: rss * 1024 // RSS is in KB
                };
            }).filter(Boolean);
        }
    } catch (error) {
        console.warn(`[Memory Tracker] Could not get processes: ${error.message}`);
        return [];
    }
}

function processData(processes) {
    const apps = {};
    
    // Group by standard normalized app name
    processes.forEach(p => {
        let appName = p.name;
        // Normalize names for tracking
        if (appName.toLowerCase().includes("antigravity")) appName = "Antigravity";
        if (appName.toLowerCase() === "node.exe") appName = "node";
        if (appName.toLowerCase().includes("language_server")) appName = "language_server";
        
        if (!apps[appName]) {
            apps[appName] = { name: appName, count: 0, memory: 0, processes: [] };
        }
        apps[appName].count++;
        apps[appName].memory += p.memory;
        apps[appName].processes.push(p);
    });

    const appList = Object.values(apps).sort((a, b) => b.memory - a.memory);
    
    // Sort individual processes within each app
    appList.forEach(app => {
        app.processes.sort((a, b) => b.memory - a.memory);
    });

    return {
        appList,
        processes: processes.sort((a, b) => b.memory - a.memory)
    };
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function generateReportSection(title, snapshotData) {
    let report = `\n=== ${title} ===\n`;
    
    report += `\n--- Top 15 Aggregated Applications ---\n`;
    snapshotData.appList.slice(0, 15).forEach(app => {
        report += `${app.name} (${app.count} processes): ${formatBytes(app.memory)}\n`;
    });
    
    report += `\n--- Tracked System Tools ---\n`;
    TRACKED_SYSTEM_APPS.forEach(trackedName => {
        const app = snapshotData.appList.find(a => a.name.toLowerCase() === trackedName.toLowerCase());
        if (app) {
            report += `${app.name} (${app.count} processes): ${formatBytes(app.memory)}\n`;
        } else {
            report += `${trackedName}: Not running / 0 B\n`;
        }
    });
    
    report += `\n--- Top 15 Individual Processes ---\n`;
    snapshotData.processes.slice(0, 15).forEach(p => {
        report += `${p.name} (PID: ${p.pid}): ${formatBytes(p.memory)}\n`;
    });
    
    return report;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error("Usage: node scripts/memory-tracker.js \"<command>\"");
        process.exit(1);
    }

    const commandString = args[0];
    console.log(`[Memory Tracker] Starting tracking for command: ${commandString}`);
    
    const beforeMem = getSystemMemory();
    const beforeProcs = getAllProcesses();
    const beforeData = processData(beforeProcs);
    
    const startTime = Date.now();
    
    let exitCode = 0;
    try {
        execSync(commandString, { stdio: "inherit" });
    } catch (err) {
        console.error(`[Memory Tracker] Error executing command: ${err.message}`);
        exitCode = err.status || 1;
    }

    
    const endTime = Date.now();
    const afterMem = getSystemMemory();
    const afterProcs = getAllProcesses();
    const afterData = processData(afterProcs);
    
    const logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logPath = path.join(logDir, `memory-tracker-${timestamp}.log`);
    
    let report = `=== Memory Tracker Comprehensive Report ===\n`;
    report += `Command: ${commandString}\n`;
    report += `Execution Time: ${((endTime - startTime) / 1000).toFixed(2)}s\n`;
    report += `Exit Code: ${exitCode}\n\n`;
    
    report += `=== System Memory Difference ===\n`;
    report += `Memory Used Before: ${formatBytes(beforeMem.used)}\n`;
    report += `Memory Used After:  ${formatBytes(afterMem.used)}\n`;
    
    const diffUsed = afterMem.used - beforeMem.used;
    const sign = diffUsed > 0 ? "+" : "";
    report += `Difference: ${sign}${formatBytes(diffUsed)}\n`;
    
    report += generateReportSection("State Before Execution", beforeData);
    report += generateReportSection("State After Execution", afterData);
    
    fs.writeFileSync(logPath, report, "utf-8");
    console.log(`\n[Memory Tracker] Complete. Report written to: ${logPath}`);
    
    process.exit(exitCode != null ? exitCode : 1);
}

main().catch(error => {
    console.error("[Memory Tracker] Fatal error:", error);
    process.exit(1);
});
