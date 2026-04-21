// GET + PATCH + DELETE /api/scion/webhooks/[id] unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findUniqueMock = jest.fn<(args: unknown) => Promise<unknown | null>>();
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
    webhookConfig: {
      findUnique: (args: unknown) =>
        (findUniqueMock as unknown as (a: unknown) => Promise<unknown | null>)(
          args,
        ),
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
  email: "admin@x",
  name: null,
  role: "ADMIN",
};

function getReq(): Request {
  return new Request("http://localhost/api/scion/webhooks/wh-1");
}
function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/scion/webhooks/wh-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function deleteReq(): Request {
  return new Request("http://localhost/api/scion/webhooks/wh-1", {
    method: "DELETE",
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  findUniqueMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("audit-1");
  deleteMock.mockResolvedValue({});
});

describe("GET /api/scion/webhooks/[id]", () => {
  it("redacts secret to '***' + last4", async () => {
    const now = new Date("2026-02-03T00:00:00Z");
    const RAW = "very-long-secret-LAST";
    findUniqueMock.mockResolvedValue({
      id: "wh-1",
      name: "n",
      endpoint: "https://x.example.com/",
      secret: RAW,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const res = await GET(getReq(), { params: { id: "wh-1" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { secretPreview: string };
    expect(body.secretPreview).toBe("***LAST");
    expect(JSON.stringify(body)).not.toContain(RAW);
  });

  it("404 when not found", async () => {
    findUniqueMock.mockResolvedValue(null);
    const res = await GET(getReq(), { params: { id: "wh-1" } });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/scion/webhooks/[id]", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await PATCH(patchReq({ isActive: false }), {
      params: { id: "wh-1" },
    });
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await PATCH(patchReq({ isActive: false }), {
      params: { id: "wh-1" },
    });
    expect(res.status).toBe(403);
  });

  it("400 when no editable fields supplied", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PATCH(patchReq({}), { params: { id: "wh-1" } });
    expect(res.status).toBe(400);
  });

  it("400 on invalid endpoint URL", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PATCH(
      patchReq({ endpoint: "http://evil.example.com/" }),
      {
        params: { id: "wh-1" },
      },
    );
    expect(res.status).toBe(400);
  });

  it("400 when rotated secret is too short", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PATCH(patchReq({ secret: "short" }), {
      params: { id: "wh-1" },
    });
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("404 when webhook does not exist", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(null);
    const res = await PATCH(patchReq({ isActive: false }), {
      params: { id: "wh-1" },
    });
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("200 toggles isActive and audits without raw secret", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const now = new Date("2026-02-04T00:00:00Z");
    findUniqueMock.mockResolvedValue({ id: "wh-1" });
    updateMock.mockResolvedValue({
      id: "wh-1",
      name: "n",
      endpoint: "https://x.example.com/",
      secret: "very-long-secret-LAST",
      isActive: false,
      createdAt: now,
      updatedAt: now,
    });
    const res = await PATCH(patchReq({ isActive: false }), {
      params: { id: "wh-1" },
    });
    expect(res.status).toBe(200);
    const updateArg = updateMock.mock.calls[0]?.[0] as {
      data: { isActive?: boolean; secret?: unknown };
    };
    expect(updateArg.data.isActive).toBe(false);
    expect(updateArg.data.secret).toBeUndefined();

    expect(writeMock).toHaveBeenCalledTimes(1);
    const auditArg = writeMock.mock.calls[0]?.[0] as {
      content: { payload: Record<string, unknown> };
    };
    expect(auditArg.content.payload.isActive).toBe(false);
    expect(auditArg.content.payload.secret).toBeUndefined();
    expect(auditArg.content.payload.secretRotated).toBeUndefined();
  });

  it("200 on secret rotation; audit logs secretRotated=true + preview, never raw", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const now = new Date("2026-02-04T00:00:00Z");
    const NEW_RAW = "another-long-rotation-9999";
    findUniqueMock.mockResolvedValue({ id: "wh-1" });
    updateMock.mockResolvedValue({
      id: "wh-1",
      name: "n",
      endpoint: "https://x.example.com/",
      secret: NEW_RAW,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const res = await PATCH(patchReq({ secret: NEW_RAW }), {
      params: { id: "wh-1" },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      webhook: { secretPreview: string };
    };
    expect(body.webhook.secretPreview).toBe("***9999");
    expect(JSON.stringify(body)).not.toContain(NEW_RAW);

    const auditArg = writeMock.mock.calls[0]?.[0] as {
      content: { payload: Record<string, unknown> };
    };
    expect(auditArg.content.payload.secretRotated).toBe(true);
    expect(auditArg.content.payload.secretPreview).toBe("***9999");
    expect(auditArg.content.payload.secret).toBeUndefined();
    expect(JSON.stringify(auditArg)).not.toContain(NEW_RAW);
  });
});

describe("DELETE /api/scion/webhooks/[id]", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await DELETE(deleteReq(), { params: { id: "wh-1" } });
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await DELETE(deleteReq(), { params: { id: "wh-1" } });
    expect(res.status).toBe(403);
  });

  it("404 when webhook does not exist", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(null);
    const res = await DELETE(deleteReq(), { params: { id: "wh-1" } });
    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("200 deletes + audits", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({ id: "wh-1", name: "n" });
    const res = await DELETE(deleteReq(), { params: { id: "wh-1" } });
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
