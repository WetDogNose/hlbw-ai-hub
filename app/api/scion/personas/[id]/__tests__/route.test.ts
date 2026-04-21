// PATCH + DELETE /api/scion/personas/[id] unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findUniqueMock = jest.fn<(args: unknown) => Promise<unknown | null>>();
const updateMock = jest.fn<(args: unknown) => Promise<unknown>>();
const deleteMock = jest.fn<(args: unknown) => Promise<unknown>>();
const issueCountMock = jest.fn<(args: unknown) => Promise<number>>();
const ledgerCountMock = jest.fn<(args: unknown) => Promise<number>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    agentPersona: {
      findUnique: (args: unknown) =>
        (findUniqueMock as unknown as (a: unknown) => Promise<unknown | null>)(
          args,
        ),
      update: (args: unknown) =>
        (updateMock as unknown as (a: unknown) => Promise<unknown>)(args),
      delete: (args: unknown) =>
        (deleteMock as unknown as (a: unknown) => Promise<unknown>)(args),
    },
    issue: {
      count: (args: unknown) =>
        (issueCountMock as unknown as (a: unknown) => Promise<number>)(args),
    },
    budgetLedger: {
      count: (args: unknown) =>
        (ledgerCountMock as unknown as (a: unknown) => Promise<number>)(args),
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

import { PATCH, DELETE } from "../route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/scion/personas/p-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(): Request {
  return new Request("http://localhost/api/scion/personas/p-1", {
    method: "DELETE",
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  findUniqueMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
  issueCountMock.mockReset();
  ledgerCountMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("audit-1");
  deleteMock.mockResolvedValue({});
  const now = new Date("2026-01-05T00:00:00Z");
  updateMock.mockResolvedValue({
    id: "p-1",
    name: "cto-owl",
    role: "CTO",
    status: "RUNNING",
    organizationId: "org-1",
    createdAt: now,
    updatedAt: now,
  });
});

describe("PATCH /api/scion/personas/[id]", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await PATCH(patchReq({ status: "RUNNING" }), {
      params: { id: "p-1" },
    });
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await PATCH(patchReq({ status: "RUNNING" }), {
      params: { id: "p-1" },
    });
    expect(res.status).toBe(403);
  });

  it("400 when body has no editable fields", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PATCH(patchReq({}), { params: { id: "p-1" } });
    expect(res.status).toBe(400);
  });

  it("400 when status is invalid", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PATCH(patchReq({ status: "EXPLODING" }), {
      params: { id: "p-1" },
    });
    expect(res.status).toBe(400);
  });

  it("400 when role is empty", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PATCH(patchReq({ role: "   " }), {
      params: { id: "p-1" },
    });
    expect(res.status).toBe(400);
  });

  it("404 when persona does not exist", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(null);
    const res = await PATCH(patchReq({ status: "RUNNING" }), {
      params: { id: "p-1" },
    });
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("400 when persona is the __system singleton", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({ id: "p-1", name: "__system" });
    const res = await PATCH(patchReq({ status: "RUNNING" }), {
      params: { id: "p-1" },
    });
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("200 + audit on happy path (role + status)", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({ id: "p-1", name: "cto-owl" });
    const res = await PATCH(
      patchReq({ role: "Principal", status: "RUNNING" }),
      { params: { id: "p-1" } },
    );
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const updateArgs = updateMock.mock.calls[0]?.[0] as {
      data: { role?: string; status?: string };
    };
    expect(updateArgs?.data).toEqual({
      role: "Principal",
      status: "RUNNING",
    });
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/scion/personas/[id]", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await DELETE(deleteReq(), { params: { id: "p-1" } });
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await DELETE(deleteReq(), { params: { id: "p-1" } });
    expect(res.status).toBe(403);
  });

  it("404 when persona does not exist", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(null);
    const res = await DELETE(deleteReq(), { params: { id: "p-1" } });
    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("400 when persona is the __system singleton", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({ id: "p-1", name: "__system" });
    const res = await DELETE(deleteReq(), { params: { id: "p-1" } });
    expect(res.status).toBe(400);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("409 when persona has assigned issues", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({ id: "p-1", name: "cto-owl" });
    issueCountMock.mockResolvedValue(2);
    ledgerCountMock.mockResolvedValue(0);
    const res = await DELETE(deleteReq(), { params: { id: "p-1" } });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { issueCount: number };
    expect(body.issueCount).toBe(2);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("409 when persona has ledger entries", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({ id: "p-1", name: "cto-owl" });
    issueCountMock.mockResolvedValue(0);
    ledgerCountMock.mockResolvedValue(5);
    const res = await DELETE(deleteReq(), { params: { id: "p-1" } });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { ledgerCount: number };
    expect(body.ledgerCount).toBe(5);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("200 + audit when clean", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({ id: "p-1", name: "cto-owl" });
    issueCountMock.mockResolvedValue(0);
    ledgerCountMock.mockResolvedValue(0);
    const res = await DELETE(deleteReq(), { params: { id: "p-1" } });
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
