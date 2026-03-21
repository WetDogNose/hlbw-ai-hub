#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import Docker from "dockerode";
import { z } from "zod";

const docker = new Docker();

const server = new Server(
  {
    name: "docker-manager-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const BuildImageArgsSchema = z.object({
  contextPath: z.string().describe("Absolute path to the directory containing the Dockerfile"),
  imageName: z.string().describe("Name/tag for the built image (e.g. wot-box-worker:latest)"),
});

const RunContainerArgsSchema = z.object({
  imageName: z.string().describe("Name of the image to run"),
  mountVolume: z.string().describe("Absolute path to the workspace to mount into /workspace"),
  envKeys: z.record(z.string()).describe("Environment variables, object form { 'GEMINI_API_KEY': 'val' }"),
  command: z.array(z.string()).describe("The command array to run (e.g. ['bash', '-c', 'script'])"),
  extraBinds: z.array(z.string()).optional().describe("Extra bind mounts in 'host:container' format"),
});

const ContainerIdSchema = z.object({
  containerId: z.string().describe("The container ID"),
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "build_image",
        description: "Builds a Docker image from a local context directory that contains a Dockerfile.",
        inputSchema: {
          type: "object",
          properties: {
            contextPath: { type: "string" },
            imageName: { type: "string" },
          },
          required: ["contextPath", "imageName"],
        },
      },
      {
        name: "run_container",
        description: "Runs an isolated Docker container in the background with a volume mount.",
        inputSchema: {
          type: "object",
          properties: {
            imageName: { type: "string" },
            mountVolume: { type: "string" },
            envKeys: { type: "object", additionalProperties: { type: "string" } },
            command: { type: "array", items: { type: "string" } },
            extraBinds: { type: "array", items: { type: "string" } },
          },
          required: ["imageName", "mountVolume", "envKeys", "command"],
        },
      },
      {
        name: "get_container_status",
        description: "Polls if the container is running or exited.",
        inputSchema: {
          type: "object",
          properties: { containerId: { type: "string" } },
          required: ["containerId"],
        },
      },
      {
        name: "stop_container",
        description: "Forcefully shuts down and removes isolated containers.",
        inputSchema: {
          type: "object",
          properties: { containerId: { type: "string" } },
          required: ["containerId"],
        },
      },
      {
        name: "get_container_logs",
        description: "Retrieves the output payload of the containerized sub-agent.",
        inputSchema: {
          type: "object",
          properties: { containerId: { type: "string" } },
          required: ["containerId"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "build_image": {
        const { contextPath, imageName } = BuildImageArgsSchema.parse(request.params.arguments);
        const stream = await docker.buildImage({
          context: contextPath,
          src: ['Dockerfile']
        }, { t: imageName });
        
        await new Promise((resolve, reject) => {
          docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
        });
        
        return { content: [{ type: "text", text: `Image ${imageName} built successfully from ${contextPath}` }] };
      }

      case "run_container": {
        const { imageName, mountVolume, envKeys, command, extraBinds } = RunContainerArgsSchema.parse(request.params.arguments);
        const envArray = Object.entries(envKeys).map(([k, v]) => `${k}=${v}`);
        
        const binds = [`${mountVolume}:/workspace`];
        if (extraBinds) {
          binds.push(...extraBinds);
        }
        
        // Always include the docker socket for swarm capabilities
        if (!binds.some(b => b.includes('docker.sock'))) {
          binds.push('/var/run/docker.sock:/var/run/docker.sock');
        }

        const container = await docker.createContainer({
          Image: imageName,
          Cmd: command,
          Env: envArray,
          HostConfig: {
            Binds: binds,
            NetworkMode: 'wot-box-network',
          },
        });
        
        await container.start();
        return { content: [{ type: "text", text: container.id }] };
      }

      case "get_container_status": {
        const { containerId } = ContainerIdSchema.parse(request.params.arguments);
        const container = docker.getContainer(containerId);
        const data = await container.inspect();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              state: data.State.Status,
              exitCode: data.State.ExitCode,
              error: data.State.Error,
            }),
          }],
        };
      }

      case "stop_container": {
        const { containerId } = ContainerIdSchema.parse(request.params.arguments);
        const container = docker.getContainer(containerId);
        try {
          await container.stop({ t: 2 });
        } catch (e: any) {
          // Ignore if already stopped (304)
          if (e.statusCode !== 304) throw e;
        }
        await container.remove({ force: true });
        return { content: [{ type: "text", text: `Container ${containerId} completely removed.` }] };
      }

      case "get_container_logs": {
        const { containerId } = ContainerIdSchema.parse(request.params.arguments);
        const container = docker.getContainer(containerId);
        const logs = await container.logs({ stdout: true, stderr: true });
        // Clean docker header characters from stream if needed
        const cleanLogs = logs.toString('utf-8').replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '');
        return { content: [{ type: "text", text: cleanLogs }] };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error?.message || String(error)}` }],
      isError: true,
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Docker Manager MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
