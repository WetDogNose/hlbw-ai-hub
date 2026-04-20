// Pass 22 — POST /api/scion/issue/[id]/resolve unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findUniqueMock = jest.fn<(args: unknown) => Promise<unknown>>();
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
      findUnique: (args: unknown) =>
        (findUniqueMock as unknown as (a: unknown) => Promise<unknown>)(args),
      update: (args: unknown) =>
        (updateMock as unknown as (a: unknown) => Promise<unknown>)(args),
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

import { POST } from "../route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

function req(body: unknown = { note: "ok" }): Request {
  return new Request("http://localhost/api/scion/issue/i-1/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  findUniqueMock.mockReset();
  updateMock.mockReset();
  writeMock.mockReset();
  updateMock.mockResolvedValue({});
  writeMock.mockResolvedValue("m-1");
});

describe("POST /api/scion/issue/[id]/resolve", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST(req(), { params: { id: "i-1" } });
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await POST(req(), { params: { id: "i-1" } });
    expect(res.status).toBe(403);
  });

  it("400 when note missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({}), { params: { id: "i-1" } });
    expect(res.status).toBe(400);
  });

  it("409 when not needs_human", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({ id: "i-1", status: "pending" });
    const res = await POST(req(), { params: { id: "i-1" } });
    expect(res.status).toBe(409);
  });

  it("200 + audit on needs_human flip", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({ id: "i-1", status: "needs_human" });
    const res = await POST(req(), { params: { id: "i-1" } });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
