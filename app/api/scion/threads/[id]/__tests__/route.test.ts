// DELETE /api/scion/threads/[id] unit tests.
//
// Verifies the 409 blocking behaviour when the thread still has issues
// linked, plus the usual admin auth + audit trail.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

type FindUniqueRow = {
  id: string;
  title: string;
  _count: { issues: number };
};

const findUniqueMock =
  jest.fn<(args: unknown) => Promise<FindUniqueRow | null>>();
const deleteMock = jest.fn<(args: unknown) => Promise<unknown>>();
const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    thread: {
      findUnique: (args: unknown) =>
        (
          findUniqueMock as unknown as (
            a: unknown,
          ) => Promise<FindUniqueRow | null>
        )(args),
      delete: (args: unknown) =>
        (deleteMock as unknown as (a: unknown) => Promise<unknown>)(args),
    },
  },
}));

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

import { DELETE } from "../route";

const admin: IapUser = {
  id: "a",
  email: "admin@example.com",
  name: null,
  role: "ADMIN",
};

function req(): Request {
  return new Request("http://localhost/api/scion/threads/t-1", {
    method: "DELETE",
  });
}

beforeEach(() => {
  findUniqueMock.mockReset();
  deleteMock.mockReset();
  getIapUserMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("audit-1");
  deleteMock.mockResolvedValue({});
});

describe("DELETE /api/scion/threads/[id]", () => {
  it("401 when unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await DELETE(req(), { params: { id: "t-1" } });
    expect(res.status).toBe(401);
  });

  it("403 when caller is not admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await DELETE(req(), { params: { id: "t-1" } });
    expect(res.status).toBe(403);
  });

  it("404 when the thread does not exist", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(null);
    const res = await DELETE(req(), { params: { id: "t-1" } });
    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("409 when the thread still has issues linked (no cascade)", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({
      id: "t-1",
      title: "busy",
      _count: { issues: 4 },
    });
    const res = await DELETE(req(), { params: { id: "t-1" } });
    expect(res.status).toBe(409);
    expect(deleteMock).not.toHaveBeenCalled();
    const body = (await res.json()) as {
      error: string;
      issueCount: number;
    };
    expect(body.issueCount).toBe(4);
    expect(body.error).toContain("4 issue");
  });

  it("200 + audit on successful delete when issue count is 0", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({
      id: "t-1",
      title: "empty",
      _count: { issues: 0 },
    });
    const res = await DELETE(req(), { params: { id: "t-1" } });
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: "t-1" } });
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("400 when id param is missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await DELETE(req(), {
      params: { id: "" } as unknown as { id: string },
    });
    expect(res.status).toBe(400);
  });
});
