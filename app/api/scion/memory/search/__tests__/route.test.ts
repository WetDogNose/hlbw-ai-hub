// Pass 23 — POST /api/scion/memory/search unit tests.
//
// admin 200 / non-admin 403 / unauth 401 / invalid body 400.
// Mocks the embedding provider + MemoryStore.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";
import type { MemoryEpisodeSimilarity } from "@/lib/orchestration/memory/MemoryStore";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const embedMock = jest.fn<(texts: string[]) => Promise<number[][]>>();
const queryBySimilarityMock =
  jest.fn<
    (vec: number[], opts?: unknown) => Promise<MemoryEpisodeSimilarity[]>
  >();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/orchestration/embeddings", () => ({
  __esModule: true,
  createEmbeddingProvider: () => ({
    name: "stub-hash",
    dim: 3,
    embed: (texts: string[]) =>
      (embedMock as unknown as (t: string[]) => Promise<number[][]>)(texts),
  }),
}));

jest.mock("@/lib/orchestration/memory/PgvectorMemoryStore", () => ({
  __esModule: true,
  getPgvectorMemoryStore: () => ({
    queryBySimilarity: (vec: number[], opts?: unknown) =>
      (
        queryBySimilarityMock as unknown as (
          v: number[],
          o?: unknown,
        ) => Promise<MemoryEpisodeSimilarity[]>
      )(vec, opts),
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
  return new Request("http://localhost/api/scion/memory/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  embedMock.mockReset();
  queryBySimilarityMock.mockReset();
  embedMock.mockResolvedValue([[0.1, 0.2, 0.3]]);
  queryBySimilarityMock.mockResolvedValue([
    {
      id: "m-1",
      taskId: "t-1",
      kind: "observation",
      agentCategory: null,
      summary: "hit",
      content: { x: 1 },
      createdAt: new Date("2026-04-20T00:00:00Z"),
      distance: 0.123,
    },
  ]);
});

describe("POST /api/scion/memory/search", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST(req({ query: "hello" }));
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await POST(req({ query: "hello" }));
    expect(res.status).toBe(403);
  });

  it("400 when query missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("400 when query blank", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({ query: "   " }));
    expect(res.status).toBe(400);
  });

  it("200 returns mapped rows with distance", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({ query: "hello" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: Array<{ id: string; distance: number }>;
    };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].id).toBe("m-1");
    expect(body.rows[0].distance).toBe(0.123);
    expect(embedMock).toHaveBeenCalledWith(["hello"]);
  });
});
