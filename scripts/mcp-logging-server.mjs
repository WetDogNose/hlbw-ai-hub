#!/usr/bin/env node
// This script implements a Model Context Protocol (MCP) server that exposes tools to interact with Google Cloud Logging.
// It provides functionality to read logs directly from the logging API.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "wot-box";

const server = new Server(
    {
        name: "gcp-logging-mcp",
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
                name: "read_gcp_logs",
                description: "Read logs directly from Google Cloud Logging.",
                inputSchema: {
                    type: "object",
                    properties: {
                        filter: {
                            type: "string",
                            description: "Advanced logging filter string (e.g. 'severity>=ERROR' or 'resource.type=\"cloud_run_revision\"')",
                        },
                        limit: {
                            type: "number",
                            description: "Number of logs to return (default 50).",
                        },
                        orderBy: {
                            type: "string",
                            description: "Order by timestamp (e.g. 'timestamp desc' or 'timestamp asc', default is 'timestamp desc').",
                        }
                    },
                },
            }
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        const authClient = await getAuthClient();
        const logging = google.logging({ version: "v2", auth: authClient });

        if (name === "read_gcp_logs") {
            const filter = args.filter || "";
            const limit = args.limit || 50;
            const orderBy = args.orderBy || "timestamp desc";

            const res = await logging.entries.list({
                requestBody: {
                    resourceNames: [`projects/${PROJECT_ID}`],
                    filter: filter,
                    pageSize: limit,
                    orderBy: orderBy,
                }
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(res.data.entries || [], null, 2),
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
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`GCP Logging MCP Server running on stdio`);
}

main().catch((error) => {
    console.error("Fatal error running MCP Server:", error);
    process.exit(1);
});
