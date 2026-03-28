import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import path from "path";

const execAsync = promisify(exec);

// Derive project root from this script's location (scripts/ -> repo root)
// This avoids relying on process.cwd() which can be the IDE's install directory.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const server = new Server(
    {
        name: "hlbw-tester",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * Define the testing tools available to any MCP-enabled agent.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "run_unit_tests",
                description: "Runs the Jest unit and component test suites via 'npm run test'.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "run_db_tests",
                description: "Runs the database integration test suites via 'npm run test:db'. Required when prisma schema logic or advanced backend routes change.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "run_security_tests",
                description: "Runs the security audits and secret linting via 'npm run test:security'. Required when modifying configurations.",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "run_type_checks",
                description: "Runs TypeScript compiler checks via 'npm run test:types'. Required after modifying any TypeScript files or adding new schema variables.",
                inputSchema: { type: "object", properties: {} },
            }
        ],
    };
});

/**
 * Execute the targeted NPM script natively and return the output or failing stack trace securely to the requesting AI.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;

    let command = "";
    if (name === "run_unit_tests") command = "npm run test";
    else if (name === "run_db_tests") command = "npm run test:db";
    else if (name === "run_security_tests") command = "npm run test:security";
    else if (name === "run_type_checks") command = "npm run test:types";
    else {
        throw new Error(`Unknown tool: ${name}`);
    }

    try {
        // We execute the scripts within the root Context dynamically
        const { stdout, stderr } = await execAsync(command, { cwd: PROJECT_ROOT });
        return {
            content: [
                {
                    type: "text",
                    text: `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`
                }
            ]
        };
    } catch (error) {
        // Even if tests fail, we want to return the output *as a success to the MCP protocol*
        // but clearly flagged as failing output so the agent can read the stack trace.
        return {
            content: [
                {
                    type: "text",
                    text: `TEST EXECUTION FAILED.\n\nSTDOUT:\n${error.stdout}\n\nSTDERR:\n${error.stderr}\n\nMESSAGE:\n${error.message}`
                }
            ],
            isError: true
        };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Hlbw Tester MCP Server successfully running on stdio.");
}

main().catch((error) => {
    console.error("Fatal error running MCP Server:", error);
    process.exit(1);
});
