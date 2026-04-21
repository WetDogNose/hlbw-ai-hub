// GET / PATCH / DELETE /api/scion/goals/[id] unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findUniqueMock = jest.fn<(args: unknown) => Promise<unknown>>();
const updateMock = jest.fn<(args: unknown) => Promise<unknown>>();
const deleteMock = jest.fn<(args: unknown) => Promise<unknown>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    goal: {
      findUnique: (args: unknown) =>
        (findUniqueMock as unknown as (a: unknown) => Promise<unknown>)(args),
      update: (args: unknown) =>
        (updateMock as unknown as (a: unknown) => Promise<unknown>)(args),
      delete: (args: unknown) =>
        (deleteMock as unknown as (a: unknown) => Promise<unknown>)(args),
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

import { GET, PATCH, DELETE } from "../route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

function getReq(): Request {
  return new Request("http://localhost/api/scion/goals/g-1");
}

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/scion/goals/g-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(): Request {
  return new Request("http://localhost/api/scion/goals/g-1", {
    method: "DELETE",
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  findUniqueMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("m-1");
});

describe("GET /api/scion/goals/[id]", () => {
  it("404 when the goal is missing", async () => {
    findUniqueMock.mockResolvedValue(null);
    const res = await GET(getReq(), { params: { id: "g-1" } });
    expect(res.status).toBe(404);
  });

  it("200 returns goal + issues summary", async () => {
    findUniqueMock.mockResolvedValue({
      id: "g-1",
      description: "Ship it",
      organizationId: "org-sys",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
      issues: [
        {
          id: "i-1",
          title: "t",
          status: "completed",
          priority: 5,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    });
    const res = await GET(getReq(), { params: { id: "g-1" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      issues: Array<{ id: string; status: string }>;
    };
    expect(body.id).toBe("g-1");
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0].status).toBe("completed");
  });
});

describe("PATCH /api/scion/goals/[id]", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await PATCH(patchReq({ description: "x" }), {
      params: { id: "g-1" },
    });
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await PATCH(patchReq({ description: "x" }), {
      params: { id: "g-1" },
    });
    expect(res.status).toBe(403);
  });

  it("400 on empty description", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PATCH(patchReq({ description: "  " }), {
      params: { id: "g-1" },
    });
    expect(res.status).toBe(400);
  });

  it("404 when goal missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(null);
    const res = await PATCH(patchReq({ description: "New" }), {
      params: { id: "g-1" },
    });
    expect(res.status).toBe(404);
  });

  it("200 + audit on happy path", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({
      id: "g-1",
      description: "Old",
      organizationId: "org-sys",
    });
    updateMock.mockResolvedValue({
      id: "g-1",
      description: "New",
      organizationId: "org-sys",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    });
    const res = await PATCH(patchReq({ description: "New" }), {
      params: { id: "g-1" },
    });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as {
      ok: boolean;
      goal: { description: string };
    };
    expect(body.ok).toBe(true);
    expect(body.goal.description).toBe("New");
  });
});

describe("DELETE /api/scion/goals/[id]", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await DELETE(deleteReq(), { params: { id: "g-1" } });
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await DELETE(deleteReq(), { params: { id: "g-1" } });
    expect(res.status).toBe(403);
  });

  it("404 when goal missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(null);
    const res = await DELETE(deleteReq(), { params: { id: "g-1" } });
    expect(res.status).toBe(404);
  });

  it("409 when issues are still linked", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({
      id: "g-1",
      description: "Linked",
      _count: { issues: 3 },
    });
    const res = await DELETE(deleteReq(), { params: { id: "g-1" } });
    expect(res.status).toBe(409);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("200 + audit when nothing is linked", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({
      id: "g-1",
      description: "Orphan",
      _count: { issues: 0 },
    });
    deleteMock.mockResolvedValue({ id: "g-1" });
    const res = await DELETE(deleteReq(), { params: { id: "g-1" } });
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
