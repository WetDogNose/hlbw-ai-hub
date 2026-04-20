// Pass 24 — POST /api/scion/providers/test
//
// Body: { provider: "gemini" | "paperclip"; prompt: string }
// Admin-only. Caps: prompt ≤ 4000 chars, max_tokens = 200. Audited.
// Returns { response, usage: { input_tokens, output_tokens }, durationMs }.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import {
  createProviderAdapter,
  type LLMProviderAdapter,
} from "@/scripts/swarm/providers";

export interface ProviderTestRequest {
  provider: string;
  prompt: string;
}

export interface ProviderTestResponse {
  response: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  durationMs: number;
  provider: string;
  modelId: string;
}

const MAX_PROMPT_CHARS = 4_000;
const MAX_OUTPUT_TOKENS = 200;
const KNOWN_PROVIDERS: ReadonlyArray<string> = ["gemini", "paperclip"];

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  let body: { provider?: unknown; prompt?: unknown };
  try {
    body =
      ((await req.json().catch(() => null)) as {
        provider?: unknown;
        prompt?: unknown;
      } | null) ?? {};
  } catch {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const providerName = body.provider;
  const prompt = body.prompt;
  if (
    typeof providerName !== "string" ||
    !KNOWN_PROVIDERS.includes(providerName)
  ) {
    return NextResponse.json(
      {
        error: `provider must be one of ${KNOWN_PROVIDERS.join(",")}`,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return NextResponse.json(
      { error: "prompt string required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: `prompt exceeds ${MAX_PROMPT_CHARS} char cap` },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let adapter: LLMProviderAdapter;
  try {
    adapter = createProviderAdapter(providerName);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "provider init failed";
    return NextResponse.json(
      { error: message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const modelId =
    providerName === "gemini"
      ? "gemini-2.5-flash"
      : (process.env.PAPERCLIP_MODEL ?? "claude-3-5-sonnet-20241022");

  const startedAt = Date.now();
  try {
    const gen = await adapter.generate({
      systemPrompt: "You are a test runner. Respond briefly.",
      userPrompt: prompt,
      modelId,
      maxTokens: MAX_OUTPUT_TOKENS,
    });
    const durationMs = Date.now() - startedAt;
    const response: ProviderTestResponse = {
      response: gen.text,
      usage: {
        input_tokens: gen.inputTokens ?? 0,
        output_tokens: gen.outputTokens ?? 0,
      },
      durationMs,
      provider: adapter.name,
      modelId: gen.modelId,
    };
    await recordAdminAction(user, "providers.test", {
      provider: adapter.name,
      modelId,
      promptLength: prompt.length,
      outputTokens: gen.outputTokens ?? 0,
      durationMs,
    });
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : "generate failed";
    console.error("/api/scion/providers/test error:", err);
    return NextResponse.json(
      { error: message, durationMs },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
