import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

// Optional: import { A2AClient } from '@a2a-js/sdk';

/**
 * Node.js Master Agent connecting to Python Sub-Agent via A2A StdIO.
 * This script demonstrates the exact Polyglot swarm architecture pattern.
 */
async function main() {
    console.log("🤖 [Master Agent] Initializing A2A Polyglot Workflow...");
    
    const pythonWorkerPath = path.join(__dirname, 'python-a2a-worker.py');
    const venvPythonPath = path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe');
    
    console.log(`🤖 [Master Agent] Spawning Sub-Agent using: ${venvPythonPath}`);
    
    const pythonProcess: ChildProcess = spawn(venvPythonPath, [pythonWorkerPath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    let isReady = false;

    // Handle python stderr (for logging)
    pythonProcess.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.error(`🐍 [Sub-Agent LOG]: ${msg}`);
        
        if (msg.includes("AWAITING_REQUESTS")) {
            isReady = true;
        }
    });

    // Handle python stdout (for A2A responses)
    pythonProcess.stdout?.on('data', (data: Buffer) => {
        const messages = data.toString().split('\n').filter(Boolean);
        for (const msg of messages) {
            try {
                // Parse the A2A JSON-RPC response
                const a2aResponse = JSON.parse(msg);
                console.log(`\n✅ [Master Agent] Received A2A Response from Sub-Agent:`);
                console.log(JSON.stringify(a2aResponse, null, 2));
                
                // Once we receive the final response, we can safely terminate the worker
                console.log("\n🤖 [Master Agent] Task complete. Terminating Sub-Agent session.");
                pythonProcess.kill();
                process.exit(0);
            } catch (err) {
                // If it's not JSON, it might just be standard stdout logging that wasn't pushed to stderr
                console.log(`🐍 [Sub-Agent OUT]: ${msg}`);
            }
        }
    });

    // Wait for the python worker to initialize
    console.log("🤖 [Master Agent] Waiting for Sub-Agent to connect to A2A stream...");
    while (!isReady) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log("🤖 [Master Agent] Sub-Agent connected! Dispatching task via A2A Protocol...");
    
    // Construct the standard A2A JSON payload
    const a2aRequest = {
        version: "1.0",
        task_id: "task-polyglot-1337",
        message: "Analyze the current memory footprint and isolate the memory leak inside the active MCP nodes.",
        context: {
            environment: "hlbw-ai-hub/swarm",
            priority: "HIGH"
        }
    };

    // Send the A2A JSON payload directly into the standard IO pipe
    pythonProcess.stdin?.write(JSON.stringify(a2aRequest) + "\n");
}

main().catch(err => {
    console.error("❌ [Master Agent] Failed to execute Polyglot workflow:", err);
    process.exit(1);
});
