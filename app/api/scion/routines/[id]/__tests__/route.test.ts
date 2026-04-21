// GET / PATCH / DELETE /api/scion/routines/[id] unit tests.

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
    routine: {
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

const existingRow = {
  id: "r-1",
  cronExpression: "0 0 * * *",
  taskPayload: '{"agentName":"a","instruction":"i"}',
  isActive: true,
  lastRunAt: null,
  createdAt: new Date("2026-04-01T00:00:00Z"),
  updatedAt: new Date("2026-04-10T00:00:00Z"),
};

function getReq(): Request {
  return new Request("http://localhost/api/scion/routines/r-1");
}

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/scion/routines/r-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(): Request {
  return new Request("http://localhost/api/scion/routines/r-1", {
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

describe("GET /api/scion/routines/[id]", () => {
  it("404 when the routine is missing", async () => {
    findUniqueMock.mockResolvedValue(null);
    const res = await GET(getReq(), { params: { id: "r-1" } });
    expect(res.status).toBe(404);
  });

  it("200 returns the routine row", async () => {
    findUniqueMock.mockResolvedValue(existingRow);
    const res = await GET(getReq(), { params: { id: "r-1" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      cronExpression: string;
      isActive: boolean;
    };
    expect(body.id).toBe("r-1");
    expect(body.cronExpression).toBe("0 0 * * *");
    expect(body.isActive).toBe(true);
  });
});

describe("PATCH /api/scion/routines/[id]", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await PATCH(patchReq({ isActive: false }), {
      params: { id: "r-1" },
    });
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await PATCH(patchReq({ isActive: false }), {
      params: { id: "r-1" },
    });
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("400 when no editable fields are supplied", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PATCH(patchReq({}), { params: { id: "r-1" } });
    expect(res.status).toBe(400);
  });

  it("400 on invalid cronExpression", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PATCH(patchReq({ cronExpression: "@hourly" }), {
      params: { id: "r-1" },
    });
    expect(res.status).toBe(400);
  });

  it("400 on invalid taskPayload", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PATCH(patchReq({ taskPayload: { agentName: "x" } }), {
      params: { id: "r-1" },
    });
    expect(res.status).toBe(400);
  });

  it("400 on non-boolean isActive", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PATCH(patchReq({ isActive: "yes" }), {
      params: { id: "r-1" },
    });
    expect(res.status).toBe(400);
  });

  it("404 when routine missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(null);
    const res = await PATCH(patchReq({ isActive: false }), {
      params: { id: "r-1" },
    });
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("200 toggles isActive and audits", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(existingRow);
    updateMock.mockResolvedValue({ ...existingRow, isActive: false });
    const res = await PATCH(patchReq({ isActive: false }), {
      params: { id: "r-1" },
    });
    expect(res.status).toBe(200);
    const updateArgs = updateMock.mock.calls[0][0] as {
      where: { id: string };
      data: { isActive: boolean };
    };
    expect(updateArgs.where.id).toBe("r-1");
    expect(updateArgs.data.isActive).toBe(false);
    expect(writeMock).toHaveBeenCalledTimes(1);
    const auditArgs = writeMock.mock.calls[0][0] as {
      content: { action: string; payload: { patch: { isActive: boolean } } };
    };
    expect(auditArgs.content.action).toBe("routine.patch");
    expect(auditArgs.content.payload.patch.isActive).toBe(false);

    const body = (await res.json()) as {
      ok: boolean;
      routine: { isActive: boolean };
    };
    expect(body.ok).toBe(true);
    expect(body.routine.isActive).toBe(false);
  });

  it("200 updates cronExpression and taskPayload together", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(existingRow);
    updateMock.mockResolvedValue({
      ...existingRow,
      cronExpression: "*/10 * * * *",
      taskPayload: '{"agentName":"z","instruction":"new"}',
    });
    const res = await PATCH(
      patchReq({
        cronExpression: "*/10 * * * *",
        taskPayload: { agentName: "z", instruction: "new" },
      }),
      { params: { id: "r-1" } },
    );
    expect(res.status).toBe(200);
    const updateArgs = updateMock.mock.calls[0][0] as {
      data: { cronExpression: string; taskPayload: string };
    };
    expect(updateArgs.data.cronExpression).toBe("*/10 * * * *");
    expect(JSON.parse(updateArgs.data.taskPayload)).toEqual({
      agentName: "z",
      instruction: "new",
    });
  });
});

describe("DELETE /api/scion/routines/[id]", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await DELETE(deleteReq(), { params: { id: "r-1" } });
    expect(res.status).toBe(401);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await DELETE(deleteReq(), { params: { id: "r-1" } });
    expect(res.status).toBe(403);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("404 when routine missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(null);
    const res = await DELETE(deleteReq(), { params: { id: "r-1" } });
    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("200 + audit on happy path", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(existingRow);
    deleteMock.mockResolvedValue({ id: "r-1" });
    const res = await DELETE(deleteReq(), { params: { id: "r-1" } });
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
    const auditArgs = writeMock.mock.calls[0][0] as {
      content: { action: string; payload: { routineId: string } };
    };
    expect(auditArgs.content.action).toBe("routine.delete");
    expect(auditArgs.content.payload.routineId).toBe("r-1");
  });
});
