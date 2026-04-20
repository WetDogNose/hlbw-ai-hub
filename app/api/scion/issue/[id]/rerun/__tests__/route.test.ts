// Pass 22 — POST /api/scion/issue/[id]/rerun unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findUniqueMock = jest.fn<(args: unknown) => Promise<unknown>>();
const createMock = jest.fn<(args: unknown) => Promise<unknown>>();
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
      create: (args: unknown) =>
        (createMock as unknown as (a: unknown) => Promise<unknown>)(args),
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

function req(): Request {
  return new Request("http://localhost/api/scion/issue/i-1/rerun", {
    method: "POST",
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  findUniqueMock.mockReset();
  createMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("m-1");
});

describe("POST /api/scion/issue/[id]/rerun", () => {
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

  it("404 when source missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(null);
    const res = await POST(req(), { params: { id: "i-1" } });
    expect(res.status).toBe(404);
  });

  it("200 + new issue id + audit when admin", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({
      id: "i-1",
      title: "t",
      instruction: "inst",
      priority: 5,
      agentCategory: "1_qa",
      metadata: { a: 1 },
      threadId: "th",
    });
    createMock.mockResolvedValue({ id: "i-2" });
    const res = await POST(req(), { params: { id: "i-1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newIssueId).toBe("i-2");
    expect(body.sourceIssueId).toBe("i-1");
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
