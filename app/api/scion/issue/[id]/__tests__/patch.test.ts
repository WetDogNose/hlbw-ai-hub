// Pass 22 — PATCH /api/scion/issue/[id] unit tests.
//
// Separate file from the pass-16 GET tests (in other dirs) so we can scope
// the jest.mock block to the PATCH-only surface.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const updateMock = jest.fn<(args: unknown) => Promise<unknown>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    issue: {
      findUnique: async () => null,
      update: (args: unknown) =>
        (updateMock as unknown as (a: unknown) => Promise<unknown>)(args),
    },
    memoryEpisode: {
      findMany: async () => [],
    },
  },
}));

jest.mock("@/lib/orchestration/memory/PgvectorMemoryStore", () => ({
  __esModule: true,
  getPgvectorMemoryStore: () => ({
    write: (ep: unknown) =>
      (writeMock as unknown as (e: unknown) => Promise<string>)(ep),
  }),
}));

import { PATCH } from "../route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

function req(body: unknown): Request {
  return new Request("http://localhost/api/scion/issue/i-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  updateMock.mockReset();
  writeMock.mockReset();
  updateMock.mockResolvedValue({
    id: "i-1",
    priority: 5,
    agentCategory: null,
    metadata: {},
  });
  writeMock.mockResolvedValue("m-1");
});

describe("PATCH /api/scion/issue/[id]", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await PATCH(req({ priority: 9 }), { params: { id: "i-1" } });
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await PATCH(req({ priority: 9 }), { params: { id: "i-1" } });
    expect(res.status).toBe(403);
  });

  it("400 when body has no editable fields", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PATCH(req({}), { params: { id: "i-1" } });
    expect(res.status).toBe(400);
  });

  it("400 when priority is not a number", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PATCH(req({ priority: "nope" }), {
      params: { id: "i-1" },
    });
    expect(res.status).toBe(400);
  });

  it("200 + audit when admin patches priority", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PATCH(req({ priority: 9 }), { params: { id: "i-1" } });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
