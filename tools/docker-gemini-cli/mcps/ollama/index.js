import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Keep OTEL setup per directives
import { initTelemetry } from "./otelSetup.js";

const logger = initTelemetry("ollama-mcp");

// The base URL for Ollama. If running inside docker, use host.docker.internal.
// If explicitly provided via ENV, use that.
const OLLAMA_BASE_URL =
  process.env.OLLAMA_URL || "http://host.docker.internal:11434";

const server = new Server(
  {
    name: "ollama-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "ollama_generate",
        description:
          "Send a text prompt to a local Ollama model to generate a response. Use this to offload smaller, highly-parallelizable sub-tasks (like linting, formatting, simple AST parsing) to the local GPU.",
        inputSchema: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description:
                "The name of the Ollama model. Prefer 'qwen2.5-coder:7b' for code tasks, and 'llama3.1:8b' or similar for general tasks.",
            },
            prompt: {
              type: "string",
              description: "The input prompt for the model.",
            },
            system: {
              type: "string",
              description:
                "Optional system prompt setting the context or persona.",
            },
          },
          required: ["model", "prompt"],
        },
      },
      {
        name: "ollama_list_models",
        description:
          "Fetch a list of all currently pulled models running on the local Ollama instance.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "ollama_embeddings",
        description:
          "Generate vector embeddings for a given text snippet using a local embedding model (e.g., nomic-embed-text). Very fast on the GPU.",
        inputSchema: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description:
                "The name of the embedding model. Ex: 'nomic-embed-text'",
            },
            prompt: {
              type: "string",
              description: "The text content to generate embeddings for.",
            },
          },
          required: ["model", "prompt"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "ollama_list_models") {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      const models = data.models
        ? data.models.map((m) => m.name).join(", ")
        : "No models pulled.";

      return {
        content: [{ type: "text", text: `Available Local Models: ${models}` }],
      };
    }

    if (name === "ollama_generate") {
      const { model, prompt, system } = args;

      const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          system,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        content: [{ type: "text", text: data.response }],
      };
    }

    if (name === "ollama_embeddings") {
      const { model, prompt } = args;

      const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        content: [{ type: "text", text: JSON.stringify(data.embedding) }],
      };
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error) {
    logger.error(`Error executing ${name}:`, error);
    return {
      content: [
        {
          type: "text",
          text: `Error calling Ollama API: ${error.message}. Is Ollama running locally?`,
        },
      ],
      isError: true,
    };
  }
});

async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Ollama MCP server is running via stdio");
}

start().catch((err) => {
  logger.error("Fatal error starting Ollama MCP server:", err);
  process.exit(1);
});
