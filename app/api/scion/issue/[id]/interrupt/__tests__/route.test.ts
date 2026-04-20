// Pass 22 — POST /api/scion/issue/[id]/interrupt unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findUniqueMock = jest.fn<(args: unknown) => Promise<unknown>>();
const interruptMock =
  jest.fn<(id: string, r: string) => Promise<{ status: string }>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    taskGraphState: {
      findUnique: (args: unknown) =>
        (findUniqueMock as unknown as (a: unknown) => Promise<unknown>)(args),
    },
  },
}));

jest.mock("@/lib/orchestration/graph", () => ({
  __esModule: true,
  defineGraph: () => ({
    interrupt: (id: string, r: string) =>
      (
        interruptMock as unknown as (
          a: string,
          b: string,
        ) => Promise<{ status: string }>
      )(id, r),
  }),
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

function req(body: unknown = {}): Request {
  return new Request("http://localhost/api/scion/issue/i-1/interrupt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  findUniqueMock.mockReset();
  interruptMock.mockReset();
  interruptMock.mockResolvedValue({ status: "interrupted" });
  writeMock.mockReset();
  writeMock.mockResolvedValue("m-1");
});

describe("POST /api/scion/issue/[id]/interrupt", () => {
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

  it("404 when no graph state", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(null);
    const res = await POST(req(), { params: { id: "i-1" } });
    expect(res.status).toBe(404);
  });

  it("200 + audit on interrupt", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({
      issueId: "i-1",
      status: "running",
    });
    const res = await POST(req({ reason: "manual" }), {
      params: { id: "i-1" },
    });
    expect(res.status).toBe(200);
    expect(interruptMock).toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
