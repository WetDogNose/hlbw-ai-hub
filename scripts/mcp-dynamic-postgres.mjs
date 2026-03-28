#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import pg from "pg";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = new Server(
    { name: "dynamic-postgres-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
);

const activeProxies = new Map(); // instanceName -> { process, port }
let nextPort = 15432;

async function getOrStartProxy(instanceName) {
    if (activeProxies.has(instanceName)) {
        return activeProxies.get(instanceName).port;
    }
    const port = nextPort++;
    const proxyPath = path.resolve(__dirname, '..', 'bin', 'cloud-sql-proxy.x64.exe');
    
    console.error(`Starting cloud sql proxy for ${instanceName} on port ${port}...`);
    const proxy = spawn(proxyPath, [instanceName, `--port=${port}`, '-g'], {
        stdio: 'ignore',
        shell: process.platform === 'win32'
    });

    activeProxies.set(instanceName, { process: proxy, port });
    
    // Give it a moment to boot
    await new Promise(resolve => setTimeout(resolve, 2000));
    return port;
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "query_postgres",
            description: "Directly query a PostgreSQL database. Native support for multi-project Cloud SQL instances.",
            inputSchema: {
                type: "object",
                properties: {
                    connectionString: {
                        type: "string",
                        description: "Standard PostgreSQL connection URI. Use localhost as host if using a generic cloudSqlInstance.",
                    },
                    cloudSqlInstance: {
                        type: "string",
                        description: "Optional. The GCP Cloud SQL connection name (e.g. project:region:instance) to auto-proxy.",
                    },
                    sql: {
                        type: "string",
                        description: "The SQL query to execute.",
                    }
                },
                required: ["connectionString", "sql"]
            }
        }
    ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    if (name === "query_postgres") {
        let dbUrl = args.connectionString;
        try {
            if (args.cloudSqlInstance) {
                const port = await getOrStartProxy(args.cloudSqlInstance);
                // Simple URL rewrite to point to our newly booted proxy port
                const urlObj = new URL(dbUrl);
                urlObj.host = "127.0.0.1";
                urlObj.port = port.toString();
                dbUrl = urlObj.toString();
            }

            const client = new pg.Client({ connectionString: dbUrl });
            await client.connect();
            const result = await client.query(args.sql);
            await client.end();

            return {
                content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }]
            };
        } catch (error) {
             return {
                isError: true,
                content: [{ type: "text", text: `Postgres Error: ${error.message}` }],
            };
        }
    }
    throw new Error(`Unknown tool: ${name}`);
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Dynamic Postgres MCP Server running on stdio");

    const cleanup = () => {
        for (const [name, proxyObj] of activeProxies.entries()) {
            proxyObj.process.kill();
        }
        process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.stdin.on('close', cleanup);
}

main().catch(console.error);
