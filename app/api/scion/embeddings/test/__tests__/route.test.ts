// Pass 24 — POST /api/scion/embeddings/test unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();
const embedMock = jest.fn<(texts: string[]) => Promise<number[][]>>();

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

jest.mock("@/lib/orchestration/embeddings", () => ({
  __esModule: true,
  createEmbeddingProvider: () => ({
    name: "test-provider",
    dim: 768,
    embed: (texts: string[]) =>
      (embedMock as unknown as (t: string[]) => Promise<number[][]>)(texts),
  }),
}));

import { POST } from "../route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

function req(body: unknown): Request {
  return new Request("http://localhost/api/scion/embeddings/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  writeMock.mockReset();
  embedMock.mockReset();
  writeMock.mockResolvedValue("m-1");
});

describe("POST /api/scion/embeddings/test", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST(req({ text: "x" }));
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await POST(req({ text: "x" }));
    expect(res.status).toBe(403);
  });

  it("400 when text is missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("400 when text exceeds 2000 char cap", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({ text: "a".repeat(2001) }));
    expect(res.status).toBe(400);
  });

  it("200 truncates vector to first 12 elements", async () => {
    getIapUserMock.mockResolvedValue(admin);
    // Build a 768-element vector.
    const full = Array.from({ length: 768 }, (_, i) => i * 0.001);
    embedMock.mockResolvedValue([full]);
    const res = await POST(req({ text: "hello" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      dim: number;
      vector: number[];
    };
    expect(body.provider).toBe("test-provider");
    expect(body.dim).toBe(768);
    expect(body.vector).toHaveLength(12);
    expect(body.vector[0]).toBe(0);
    expect(body.vector[11]).toBeCloseTo(0.011);
    // Audit row written.
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("502 when embed returns empty", async () => {
    getIapUserMock.mockResolvedValue(admin);
    embedMock.mockResolvedValue([[]]);
    const res = await POST(req({ text: "hi" }));
    expect(res.status).toBe(502);
  });
});
