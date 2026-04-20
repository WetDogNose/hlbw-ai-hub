// Pass 17 — PaperclipAdapter unit tests.
//
// The adapter wraps the LiteLLM proxy that `tools/docker-paperclip/`
// exposes on port 4000. We mock `fetch` (injected via constructor) and
// verify:
//   1. happy-path → `generate()` returns a mapped GenerationResponse
//      with tokens from the proxy's `usage` block.
//   2. success path calls `recordProviderUsage` once with `error:false`.
//   3. HTTP 500 → generate rethrows, and `recordProviderUsage` still
//      fires from the `finally` block with `error:true`.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { PaperclipAdapter } from "../providers";

// Mock the budget module that `recordProviderUsage` dynamically imports.
// The mock factory captures calls so assertions can inspect them.
const recordTokenUsageMock = jest.fn(async () => undefined);

jest.mock("@/lib/orchestration/budget", () => ({
  __esModule: true,
  recordTokenUsage: (...args: unknown[]) => recordTokenUsageMock(...args),
}));

describe("PaperclipAdapter", () => {
  beforeEach(() => {
    recordTokenUsageMock.mockClear();
  });

  it("maps an Anthropic-shape response into GenerationResponse", async () => {
    const fakeFetch = jest.fn(async (_url: unknown, _init: unknown) => {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            content: [{ type: "text", text: "hello from paperclip" }],
            stop_reason: "end_turn",
            usage: { input_tokens: 12, output_tokens: 4 },
          };
        },
        async text() {
          return "";
        },
      } as unknown as Response;
    });

    const adapter = new PaperclipAdapter({
      proxyUrl: "http://127.0.0.1:4000",
      model: "ollama_chat/qwen2.5-coder:32b",
      modelId: "ollama_chat/qwen2.5-coder:32b",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    const resp = await adapter.generate({
      systemPrompt: "you are a test",
      userPrompt: "say hi",
      modelId: "ollama_chat/qwen2.5-coder:32b",
      metadata: { taskId: "task-123" },
    });

    expect(resp.text).toBe("hello from paperclip");
    expect(resp.provider).toBe("paperclip");
    expect(resp.inputTokens).toBe(12);
    expect(resp.outputTokens).toBe(4);
    expect(resp.totalTokens).toBe(16);
    expect(resp.finishReason).toBe("end_turn");

    // fetch was called against /v1/messages with correct headers.
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const call = fakeFetch.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    const [url, init] = call;
    expect(url).toBe("http://127.0.0.1:4000/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("sk-mock");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("ollama_chat/qwen2.5-coder:32b");
    expect(body.max_tokens).toBe(1024);
    expect(body.system).toBe("you are a test");
    expect(body.messages).toEqual([{ role: "user", content: "say hi" }]);

    // Success → ledger hit exactly once with error:false.
    expect(recordTokenUsageMock).toHaveBeenCalledTimes(1);
    const ledgerArgs = recordTokenUsageMock.mock.calls[0][0] as {
      taskId: string;
      totalTokens: number;
      model: string;
      error?: boolean;
    };
    expect(ledgerArgs.taskId).toBe("task-123");
    expect(ledgerArgs.totalTokens).toBe(16);
    expect(ledgerArgs.error).toBe(false);
  });

  it("records usage in the finally block and rethrows on HTTP 500", async () => {
    const fakeFetch = jest.fn(async () => {
      return {
        ok: false,
        status: 500,
        async json() {
          return {};
        },
        async text() {
          return "proxy exploded";
        },
      } as unknown as Response;
    });

    const adapter = new PaperclipAdapter({
      proxyUrl: "http://127.0.0.1:4000/",
      model: "ollama_chat/qwen2.5-coder:32b",
      modelId: "ollama_chat/qwen2.5-coder:32b",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    await expect(
      adapter.generate({
        systemPrompt: "sys",
        userPrompt: "u",
        modelId: "ollama_chat/qwen2.5-coder:32b",
        metadata: { taskId: "task-err" },
      }),
    ).rejects.toThrow(/HTTP 500/);

    // Even on error, the finally block records usage (error:true).
    expect(recordTokenUsageMock).toHaveBeenCalledTimes(1);
    const ledgerArgs = recordTokenUsageMock.mock.calls[0][0] as {
      taskId: string;
      error?: boolean;
    };
    expect(ledgerArgs.taskId).toBe("task-err");
    expect(ledgerArgs.error).toBe(true);
  });

  it("strips a trailing slash from proxyUrl", async () => {
    const fakeFetch = jest.fn(async (url: unknown) => {
      expect(url).toBe("http://127.0.0.1:4000/v1/messages");
      return {
        ok: true,
        status: 200,
        async json() {
          return { content: [{ type: "text", text: "ok" }], usage: {} };
        },
        async text() {
          return "";
        },
      } as unknown as Response;
    });
    const adapter = new PaperclipAdapter({
      proxyUrl: "http://127.0.0.1:4000/",
      model: "m",
      modelId: "m",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    await adapter.generate({
      systemPrompt: "",
      userPrompt: "",
      modelId: "m",
    });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
});
