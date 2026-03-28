#!/usr/bin/env node
// This script implements a Model Context Protocol (MCP) server that exposes tools to interact with Google Cloud Trace.
// It provides functionality to list recent traces and fetch detailed trace information.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import { execSync } from "node:child_process";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "wot-box";

const server = new Server(
    {
        name: "gcp-trace-mcp",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

async function getAuthClient() {
    const auth = new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    return await auth.getClient();
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "list_recent_traces",
                description: "List recent traces from Google Cloud Trace.",
                inputSchema: {
                    type: "object",
                    properties: {
                        projectId: {
                            type: "string",
                            description: "Optional GCP Project ID. Defaults to the environment configured project.",
                        },
                        limit: {
                            type: "number",
                            description: "Number of traces to return (default 10).",
                        },
                        filter: {
                            type: "string",
                            description: "Optional filter string (e.g. 'root:/api/boxes').",
                        },
                        startTime: {
                            type: "string",
                            description: "ISO8601 start time (default 1 hr ago).",
                        },
                        endTime: {
                            type: "string",
                            description: "ISO8601 end time (default now).",
                        }
                    },
                },
            },
            {
                name: "get_trace_details",
                description: "Get detailed spans and metadata for a specific trace ID.",
                inputSchema: {
                    type: "object",
                    properties: {
                        projectId: {
                            type: "string",
                            description: "Optional GCP Project ID. Defaults to the environment configured project.",
                        },
                        traceId: {
                            type: "string",
                            description: "The trace ID to fetch.",
                        },
                    },
                    required: ["traceId"],
                },
            },
            {
                name: "get_memory_stats",
                description: "Get current statistics from the Neo4j shared memory graph (swarm knowledge base).",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === "get_memory_stats") {
            try {
                const query = (cypher) => {
                    return execSync(`docker exec wot-box-neo4j cypher-shell -u neo4j -p wotbox-swarm --format plain "${cypher}"`).toString().trim().split('\n').slice(1).join('\n');
                };

                const nodes = query("MATCH (n) RETURN count(n)");
                const relations = query("MATCH ()-[r]->() RETURN count(r)");
                const labels = query("MATCH (n) RETURN labels(n)[0] as type, count(n) as count");

                return {
                    content: [
                        {
                            type: "text",
                            text: `Neo4j Shared Memory (Local Swarm Knowledge):\n- Total Nodes: ${nodes}\n- Total Relations: ${relations}\n\nNode Distribution:\n${labels || "No data yet"}`,
                        },
                    ],
                };
            } catch (err) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Failed to query Neo4j: ${err.message}` }],
                };
            }
        }

        const authClient = await getAuthClient();
        const cloudtrace = google.cloudtrace({ version: "v1", auth: authClient });

        if (name === "list_recent_traces") {
            const limit = args.limit || 10;
            const filter = args.filter || undefined;
            const projectId = args.projectId || PROJECT_ID;

            const endTime = args.endTime ? new Date(args.endTime) : new Date();
            const startTime = args.startTime ? new Date(args.startTime) : new Date(endTime.getTime() - 60 * 60 * 1000);

            const res = await cloudtrace.projects.traces.list({
                projectId: projectId,
                filter: filter,
                pageSize: limit,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                view: 'MINIMAL'
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(res.data.traces || [], null, 2),
                    },
                ],
            };
        } else if (name === "get_trace_details") {
            const traceId = args.traceId;
            const projectId = args.projectId || PROJECT_ID;
            if (!traceId) {
                throw new Error("traceId is required");
            }

            const res = await cloudtrace.projects.traces.get({
                projectId: projectId,
                traceId: traceId,
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(res.data, null, 2),
                    },
                ],
            };
        } else {
            throw new Error(`Tool ${name} not found`);
        }
    } catch (error) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: `Error executing tool: ${error.message}\n${error.stack}`,
                },
            ],
        };
    }
});

async function main() {
    // --- Auto-start local infrastructure containers ---

    // 1. Jaeger (OTEL trace viewer)
    try {
        const running = execSync("docker ps -q -f name=wot-box-jaeger").toString().trim();
        if (!running) {
            const stopped = execSync("docker ps -a -q -f name=wot-box-jaeger").toString().trim();
            if (stopped) {
                execSync(`docker start ${stopped}`);
            } else {
                execSync("docker run -d --name wot-box-jaeger -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:latest");
            }
        }
    } catch (err) {
        console.error("Warning: Failed to auto-start local Jaeger container:", err.message);
    }

    // 2. Neo4j (shared memory graph database)
    try {
        const running = execSync("docker ps -q -f name=wot-box-neo4j").toString().trim();
        if (!running) {
            const stopped = execSync("docker ps -a -q -f name=wot-box-neo4j").toString().trim();
            if (stopped) {
                execSync(`docker start ${stopped}`);
            } else {
                execSync([
                    "docker run -d --name wot-box-neo4j",
                    "-p 7474:7474 -p 7687:7687",
                    "-e NEO4J_AUTH=neo4j/wotbox-swarm",
                    "-e NEO4J_PLUGINS=[\\\"apoc\\\"]",
                    "-v wot-box-neo4j-data:/data",
                    "neo4j:5"
                ].join(" "));
            }
        }
        console.error("Neo4j shared memory: http://localhost:7474 (bolt://localhost:7687)");
    } catch (err) {
        console.error("Warning: Failed to auto-start local Neo4j container:", err.message);
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`GCP Trace MCP Server running on stdio (Jaeger + Neo4j auto-started)`);
    
    // Cleanup on disconnect
    const cleanup = () => {
        try {
            console.error("Shutting down local infrastructure containers...");
            execSync("docker stop wot-box-jaeger", { stdio: 'ignore' });
            execSync("docker stop wot-box-neo4j", { stdio: 'ignore' });
        } catch(e) {}
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    // When the stdio disconnects (AI CLI exits)
    process.stdin.on('close', cleanup);
}

main().catch((error) => {
    console.error("Fatal error running MCP Server:", error);
    process.exit(1);
});