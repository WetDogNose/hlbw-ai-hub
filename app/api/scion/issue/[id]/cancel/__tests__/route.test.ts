// Pass 22 — POST /api/scion/issue/[id]/cancel unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findUniqueMock = jest.fn<(args: unknown) => Promise<unknown>>();
const issueUpdateMock = jest.fn<(args: unknown) => Promise<unknown>>();
const graphUpdateMock = jest.fn<(args: unknown) => Promise<unknown>>();
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
        (issueUpdateMock as unknown as (a: unknown) => Promise<unknown>)(args),
    },
    taskGraphState: {
      update: (args: unknown) =>
        (graphUpdateMock as unknown as (a: unknown) => Promise<unknown>)(args),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        issue: {
          update: (args: unknown) =>
            (issueUpdateMock as unknown as (a: unknown) => Promise<unknown>)(
              args,
            ),
        },
        taskGraphState: {
          update: (args: unknown) =>
            (graphUpdateMock as unknown as (a: unknown) => Promise<unknown>)(
              args,
            ),
        },
      }),
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
  return new Request("http://localhost/api/scion/issue/i-1/cancel", {
    method: "POST",
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  findUniqueMock.mockReset();
  issueUpdateMock.mockReset();
  graphUpdateMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("m-1");
  issueUpdateMock.mockResolvedValue({});
  graphUpdateMock.mockResolvedValue({});
});

describe("POST /api/scion/issue/[id]/cancel", () => {
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

  it("404 when issue not found", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(null);
    const res = await POST(req(), { params: { id: "i-1" } });
    expect(res.status).toBe(404);
  });

  it("409 when issue already terminal", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({
      id: "i-1",
      status: "completed",
      graphState: null,
    });
    const res = await POST(req(), { params: { id: "i-1" } });
    expect(res.status).toBe(409);
  });

  it("200 + audit when admin cancels a running issue", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({
      id: "i-1",
      status: "in_progress",
      graphState: { issueId: "i-1" },
    });
    const res = await POST(req(), { params: { id: "i-1" } });
    expect(res.status).toBe(200);
    expect(issueUpdateMock).toHaveBeenCalled();
    expect(graphUpdateMock).toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
