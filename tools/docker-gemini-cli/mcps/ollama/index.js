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
          "Send a text prompt to a local Ollama model. Optimized for high-throughput GPU tasks.",
        inputSchema: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: "The name of the Ollama model.",
            },
            prompt: {
              type: "string",
              description: "The input prompt for the model.",
            },
            system: {
              type: "string",
              description: "Optional system prompt.",
            },
            options: {
              type: "object",
              description: "Advanced model parameters (num_ctx, num_gpu, num_thread, temperature, etc.).",
              properties: {
                num_ctx: { type: "number", description: "Sets the size of the context window." },
                num_gpu: { type: "number", description: "The number of layers to send to the GPU(s)." },
                num_thread: { type: "number", description: "Sets the number of threads to use." },
                temperature: { type: "number" },
                top_p: { type: "number" },
                seed: { type: "number" }
              }
            }
          },
          required: ["model", "prompt"],
        },
      },
      {
        name: "ollama_batch_generate",
        description:
          "Executes multiple prompts in parallel across the local GPU cluster. Use this for massive data normalization or batch code analysis.",
        inputSchema: {
          type: "object",
          properties: {
            model: { type: "string" },
            prompts: { 
              type: "array", 
              items: { type: "string" },
              description: "Array of prompts to process concurrently."
            },
            system: { type: "string" },
            options: { type: "object" }
          },
          required: ["model", "prompts"],
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
      const { model, prompt, system, options } = args;

      const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          system,
          options,
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

    if (name === "ollama_batch_generate") {
      const { model, prompts, system, options } = args;

      const results = await Promise.all(prompts.map(async (p) => {
        try {
          const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, prompt: p, system, options, stream: false }),
          });
          if (!response.ok) return `Error: ${response.statusText}`;
          const data = await response.json();
          return data.response;
        } catch (err) {
          return `Error: ${err.message}`;
        }
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
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
