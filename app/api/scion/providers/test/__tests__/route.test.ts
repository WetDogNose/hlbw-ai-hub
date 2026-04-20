// Pass 24 — POST /api/scion/providers/test unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";
import type {
  GenerationRequest,
  GenerationResponse,
  LLMProviderAdapter,
} from "@/scripts/swarm/providers";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();
const generateMock =
  jest.fn<(req: GenerationRequest) => Promise<GenerationResponse>>();
const createAdapterMock = jest.fn<(name: string) => LLMProviderAdapter>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/orchestration/memory/PgvectorMemoryStore", () => ({
  __esModule: true,
  getPgvectorMemoryStore: () => ({
    write: (ep: unknown) =>
      (writeMock as unknown as (e: unknown) => Promise<string>)(ep),
  }),
}));

jest.mock("@/scripts/swarm/providers", () => ({
  __esModule: true,
  createProviderAdapter: (name: string) =>
    (createAdapterMock as unknown as (n: string) => LLMProviderAdapter)(name),
}));

import { POST } from "../route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

function req(body: unknown): Request {
  return new Request("http://localhost/api/scion/providers/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  writeMock.mockReset();
  generateMock.mockReset();
  createAdapterMock.mockReset();
  writeMock.mockResolvedValue("m-1");
  const fakeAdapter: LLMProviderAdapter = {
    name: "gemini",
    generate: (r: GenerationRequest) =>
      (
        generateMock as unknown as (
          g: GenerationRequest,
        ) => Promise<GenerationResponse>
      )(r),
    healthcheck: async () => true,
  };
  createAdapterMock.mockReturnValue(fakeAdapter);
  generateMock.mockResolvedValue({
    text: "hi",
    provider: "gemini",
    modelId: "gemini-2.5-flash",
    finishReason: "stop",
    inputTokens: 5,
    outputTokens: 7,
    totalTokens: 12,
  });
});

describe("POST /api/scion/providers/test", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST(req({ provider: "gemini", prompt: "hi" }));
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await POST(req({ provider: "gemini", prompt: "hi" }));
    expect(res.status).toBe(403);
  });

  it("400 when provider is unknown", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({ provider: "openai", prompt: "hi" }));
    expect(res.status).toBe(400);
  });

  it("400 when prompt is empty", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({ provider: "gemini", prompt: "" }));
    expect(res.status).toBe(400);
  });

  it("400 when prompt exceeds 4000 chars", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(
      req({ provider: "gemini", prompt: "a".repeat(4001) }),
    );
    expect(res.status).toBe(400);
  });

  it("200 enforces 200 max_tokens cap in the generate call", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({ provider: "gemini", prompt: "hi" }));
    expect(res.status).toBe(200);
    expect(generateMock).toHaveBeenCalledTimes(1);
    const genArgs = generateMock.mock.calls[0][0] as GenerationRequest;
    expect(genArgs.maxTokens).toBe(200);
    const body = (await res.json()) as {
      usage: { input_tokens: number; output_tokens: number };
      durationMs: number;
    };
    expect(body.usage.input_tokens).toBe(5);
    expect(body.usage.output_tokens).toBe(7);
    expect(typeof body.durationMs).toBe("number");
    // Audit + usage recorded.
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("502 when the provider throws", async () => {
    getIapUserMock.mockResolvedValue(admin);
    generateMock.mockRejectedValueOnce(new Error("upstream down"));
    const res = await POST(req({ provider: "gemini", prompt: "hi" }));
    expect(res.status).toBe(502);
  });
});
