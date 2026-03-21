// Provider Adapter Layer (Gap 6)
// Normalizes model invocation across providers. Core orchestrator never branches on provider names.

import { getTracer } from "./tracing";

// --- Contracts ---

export interface GenerationRequest {
  systemPrompt: string;
  userPrompt: string;
  modelId: string;
  maxTokens?: number;
  temperature?: number;
  timeoutSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface GenerationResponse {
  text: string;
  provider: string;
  modelId: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  raw?: unknown;
}

export interface LLMProviderAdapter {
  readonly name: string;
  generate(request: GenerationRequest): Promise<GenerationResponse>;
  healthcheck(): Promise<boolean>;
}

// --- Gemini Adapter ---

export class GeminiAdapter implements LLMProviderAdapter {
  readonly name = "gemini";

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const tracer = getTracer();
    return tracer.startActiveSpan("Provider:Gemini:generate", async (span) => {
      span.setAttribute("model.id", request.modelId);
      try {
        // In a full implementation this would call the Gemini SDK.
        // For swarm workers running in Docker, the container itself handles LLM calls.
        // This adapter exists so the orchestrator can health-check and estimate costs.
        const text = `[gemini-stub] Executed: ${request.userPrompt.slice(0, 120)}`;
        span.end();
        return {
          text,
          provider: this.name,
          modelId: request.modelId,
          finishReason: "stop",
        };
      } catch (err: any) {
        span.recordException(err);
        span.end();
        throw err;
      }
    });
  }

  async healthcheck(): Promise<boolean> {
    try {
      // Verify the GEMINI_API_KEY is present
      return !!process.env.GEMINI_API_KEY;
    } catch {
      return false;
    }
  }
}

// --- Provider Registry ---

const adapters: Record<string, LLMProviderAdapter> = {};

export function registerProvider(adapter: LLMProviderAdapter): void {
  adapters[adapter.name] = adapter;
}

export function getProvider(name: string): LLMProviderAdapter {
  const adapter = adapters[name];
  if (!adapter) throw new Error(`Unknown provider: ${name}. Registered: ${Object.keys(adapters).join(", ")}`);
  return adapter;
}

export function listProviders(): string[] {
  return Object.keys(adapters);
}

// Auto-register built-in adapters
registerProvider(new GeminiAdapter());
