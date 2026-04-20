// Provider Adapter Layer (Gap 6)
// Normalizes model invocation across providers. Core orchestrator never branches on provider names.
//
// Pass 16 — Token usage now flows through
// `lib/orchestration/budget.ts::recordTokenUsage` (via the thin wrapper
// `recordProviderUsage` below) so `BudgetLedger` accumulates real spend. The
// hook is opt-in per call via `GenerationRequest.metadata.taskId`. Providers
// that don't know their taskId simply skip the write; the swarm runner
// (see `scripts/swarm/runner/nodes.ts`) supplies `taskId` when routing
// requests through the adapter.

import { getTracer } from "./tracing";
import { SPAN_ATTR } from "@/lib/orchestration/tracing/attrs";

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

// --- Token-usage hook (pass 16) ---

export interface RecordProviderUsageInput {
  taskId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model: string;
  provider: string;
  /**
   * Pass 16 REWORK cycle 1 — when true, this row represents usage recorded
   * from an error path (partial output before failure). Success-path spend
   * sets this to `false` (or omits it). The ledger counts both equally
   * against the daily limit; the flag exists for audit/debugging.
   */
  error?: boolean;
}

/**
 * Dynamic import so the swarm runner (which boots before the Next.js
 * Prisma client is initialised in some environments) doesn't crash on
 * import when no DB is reachable. Test suites replace the module via
 * `jest.mock('@/lib/orchestration/budget')`.
 */
export async function recordProviderUsage(
  input: RecordProviderUsageInput,
): Promise<void> {
  if (!input.taskId) return;
  const total =
    typeof input.totalTokens === "number"
      ? input.totalTokens
      : (input.inputTokens ?? 0) + (input.outputTokens ?? 0);
  // Pass 16 REWORK cycle 1 — error-path rows are always written (even with
  // zero tokens) so failing provider calls leave an auditable BudgetLedger
  // trace. Success-path rows with zero total are skipped to avoid noise.
  if (total <= 0 && !input.error) return;
  try {
    const mod =
      (await import("@/lib/orchestration/budget")) as typeof import("@/lib/orchestration/budget");
    await mod.recordTokenUsage({
      taskId: input.taskId,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: total,
      model: input.model,
      error: input.error,
    });
  } catch (err) {
    console.warn(
      `[providers.recordProviderUsage] skipped: ${String(err instanceof Error ? err.message : err)}`,
    );
  }
}

// --- Gemini Adapter ---

export class GeminiAdapter implements LLMProviderAdapter {
  readonly name = "gemini";

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const tracer = getTracer();
    // Pass 18 — unify on the `Provider:generate` span name + standardized
    // attribute keys so Jaeger/Cloud Trace filters work the same for every
    // adapter. Token counts are tagged on the span once known (success
    // path), alongside the provider name and model id.
    return tracer.startActiveSpan("Provider:generate", async (span) => {
      span.setAttribute(SPAN_ATTR.PROVIDER, this.name);
      span.setAttribute(SPAN_ATTR.MODEL_ID, request.modelId);
      if (typeof request.metadata?.taskId === "string") {
        span.setAttribute(SPAN_ATTR.TASK_ID, request.metadata.taskId);
      }
      // Pass 16 REWORK cycle 1 — hoist usage accumulators above the try so a
      // failure after partial generation still yields a BudgetLedger row.
      const inputTokens = Math.ceil(
        (request.systemPrompt.length + request.userPrompt.length) / 4,
      );
      let outputTokens = 0;
      const taskId =
        typeof request.metadata?.taskId === "string"
          ? (request.metadata.taskId as string)
          : null;
      let errored = false;
      try {
        // In a full implementation this would call the Gemini SDK.
        // For swarm workers running in Docker, the container itself handles LLM calls.
        // This adapter exists so the orchestrator can health-check and estimate costs.
        const text = `[gemini-stub] Executed: ${request.userPrompt.slice(0, 120)}`;
        // Pass 16 — approximate usage; real SDK will return exact counts.
        outputTokens = Math.ceil(text.length / 4);
        span.setAttribute(SPAN_ATTR.INPUT_TOKENS, inputTokens);
        span.setAttribute(SPAN_ATTR.OUTPUT_TOKENS, outputTokens);
        return {
          text,
          provider: this.name,
          modelId: request.modelId,
          finishReason: "stop",
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        };
      } catch (err: any) {
        errored = true;
        span.recordException(err);
        throw err;
      } finally {
        // Even on error, record whatever usage we accumulated so partial
        // spend counts against the daily budget. Ledger failures are logged
        // by `recordProviderUsage` itself and must not mask the original
        // error.
        try {
          await recordProviderUsage({
            taskId,
            inputTokens,
            outputTokens,
            model: request.modelId,
            provider: this.name,
            error: errored,
          });
        } catch (recErr) {
          console.warn("recordProviderUsage failed", recErr);
        }
        span.end();
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

// --- Paperclip Adapter (pass 17) ---
//
// Wraps the LiteLLM proxy that `tools/docker-paperclip/Dockerfile` stands
// up on port 4000. The proxy fakes the Anthropic Messages API on top of a
// local Ollama (`qwen2.5-coder:32b` by default). The adapter speaks the
// public Anthropic shape (`POST /v1/messages`) and maps the response into
// the swarm's generic `GenerationResponse`. It is side-effect-free at
// construction — it does NOT start the container, it does NOT health-check
// the proxy. That is the caller's job (see `healthcheck()` / operator).

export interface PaperclipAdapterOptions {
  proxyUrl: string;
  model: string;
  modelId: string;
  /** Override the default fetch (tests inject here). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface AnthropicContentBlock {
  type?: string;
  text?: string;
}
interface AnthropicMessagesResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export class PaperclipAdapter implements LLMProviderAdapter {
  readonly name = "paperclip";

  private readonly proxyUrl: string;
  private readonly model: string;
  private readonly modelId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: PaperclipAdapterOptions) {
    // Constructor must not perform I/O — the container may not be running.
    this.proxyUrl = opts.proxyUrl.replace(/\/$/, "");
    this.model = opts.model;
    this.modelId = opts.modelId;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const tracer = getTracer();
    // Pass 18 — unified `Provider:generate` span with the standardized
    // attribute schema. Paperclip-specific proxy/model labels stay as
    // explicit keys because they aren't part of the cross-provider
    // schema contract.
    return tracer.startActiveSpan("Provider:generate", async (span) => {
      span.setAttribute(SPAN_ATTR.PROVIDER, this.name);
      span.setAttribute(SPAN_ATTR.MODEL_ID, request.modelId);
      span.setAttribute("paperclip.proxy", this.proxyUrl);
      span.setAttribute("paperclip.model", this.model);
      if (typeof request.metadata?.taskId === "string") {
        span.setAttribute(SPAN_ATTR.TASK_ID, request.metadata.taskId);
      }

      const taskId =
        typeof request.metadata?.taskId === "string"
          ? (request.metadata.taskId as string)
          : null;
      let inputTokens = Math.ceil(
        (request.systemPrompt.length + request.userPrompt.length) / 4,
      );
      let outputTokens = 0;
      let errored = false;

      try {
        const maxTokens = request.maxTokens ?? 1024;
        const payload = {
          model: this.model,
          max_tokens: maxTokens,
          system: request.systemPrompt,
          messages: [{ role: "user", content: request.userPrompt }],
        };
        const resp = await this.fetchImpl(`${this.proxyUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // Matches the Dockerfile's mock setup:
            // ENV ANTHROPIC_API_KEY=sk-mock.
            "x-api-key": "sk-mock",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const body = await resp.text().catch(() => "<unreadable>");
          throw new Error(
            `Paperclip proxy returned HTTP ${resp.status}: ${body.slice(0, 500)}`,
          );
        }

        const parsed = (await resp.json()) as AnthropicMessagesResponse;
        const text = (parsed.content ?? [])
          .filter((b) => b.type === "text" && typeof b.text === "string")
          .map((b) => b.text as string)
          .join("");

        if (typeof parsed.usage?.input_tokens === "number") {
          inputTokens = parsed.usage.input_tokens;
        }
        if (typeof parsed.usage?.output_tokens === "number") {
          outputTokens = parsed.usage.output_tokens;
        } else {
          outputTokens = Math.ceil(text.length / 4);
        }
        span.setAttribute(SPAN_ATTR.INPUT_TOKENS, inputTokens);
        span.setAttribute(SPAN_ATTR.OUTPUT_TOKENS, outputTokens);

        return {
          text,
          provider: this.name,
          modelId: request.modelId,
          finishReason: parsed.stop_reason ?? "stop",
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          raw: parsed,
        };
      } catch (err) {
        errored = true;
        span.recordException(err as Error);
        throw err;
      } finally {
        try {
          await recordProviderUsage({
            taskId,
            inputTokens,
            outputTokens,
            model: request.modelId,
            provider: this.name,
            error: errored,
          });
        } catch (recErr) {
          console.warn("recordProviderUsage failed", recErr);
        }
        span.end();
      }
    });
  }

  async healthcheck(): Promise<boolean> {
    // Non-throwing: a down proxy means "not healthy", not "crash the caller".
    try {
      const resp = await this.fetchImpl(`${this.proxyUrl}/health`, {
        method: "GET",
      });
      return resp.ok;
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
  if (!adapter)
    throw new Error(
      `Unknown provider: ${name}. Registered: ${Object.keys(adapters).join(", ")}`,
    );
  return adapter;
}

export function listProviders(): string[] {
  return Object.keys(adapters);
}

// --- Factory (pass 17) ---
//
// The swarm dispatcher selects a provider per task (category override or
// policy default). The factory centralises env-driven construction so
// tests can exercise the gating logic without touching the registry.

export function createProviderAdapter(name: string): LLMProviderAdapter {
  if (name === "gemini") {
    return new GeminiAdapter();
  }
  if (name === "paperclip") {
    const proxyUrl = process.env.PAPERCLIP_PROXY_URL;
    const model = process.env.PAPERCLIP_MODEL;
    if (!proxyUrl || !model) {
      throw new Error(
        "paperclip provider requires PAPERCLIP_PROXY_URL and PAPERCLIP_MODEL env vars",
      );
    }
    return new PaperclipAdapter({ proxyUrl, model, modelId: model });
  }
  throw new Error(`Unknown provider: ${name}`);
}

// Auto-register built-in adapters
registerProvider(new GeminiAdapter());
