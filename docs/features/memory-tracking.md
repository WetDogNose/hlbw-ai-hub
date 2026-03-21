# Memory Tracking Toolchain

## Overview
The Memory Tracking Toolchain is a utility integrated directly into the `package.json` testing scripts. It provides visibility into system and process memory consumption during the execution of testing, validation, and linting pipelines. This is especially useful for identifying memory leaks in long-running processes, zombie MCP servers, or database connection pools that fail to close.

## Implementation Details
All test scripts (`npm run test`, `npm run test:db`, `npm run test:security`, `npm run test:types`) are now wrapped with the `scripts/memory-tracker.js` Node.js script.

### How It Works
1. **Pre-Flight Snapshot:** The wrapper parses ALL processes currently running on the system.
2. **Aggregation:** It groups identical processes by their application name (e.g., combining 12 node tasks into one "node" group) to determine the macro-level impact of full tools. It natively isolates `Antigravity`, `node`, `vmmemWSL`, `docker`, `postgres`, and `language_server` regardless of rank.
3. **Execution:** The incoming command (e.g., `jest`) is spawned securely as a child process.
4. **Post-Flight Snapshot:** Upon completion of the child process, a second comprehensive snapshot is captured.
5. **Report Generation:** A detailed report is generated breaking down:
   - Overall system memory difference.
   - Top 15 Aggregated Applications.
   - Specific footprint of the 6 fixed system tools (like the Antigravity IDE).
   - Top 15 Individual Processes mapping to exact PIDs.
6. **Persistence:** The report is saved to the `logs/` directory as `memory-tracker-[timestamp].log`.

## Usage
Simply run any of the standard testing commands:
```bash
npm run test
npm run test:db
```
The memory tracking report line will be printed to the console at the end of the test run, pointing to the log file location.

## AI Integration
The AI agent is equipped with the `Memory Analyzer` skill (`.agents/skills/memory-analyzer`), which instructs it on how to parse the `logs/memory-tracker-*.log` files to diagnose potential memory leaks (e.g., identifying stale `node.exe` or `postgres` processes that grew substantially without tearing down).
