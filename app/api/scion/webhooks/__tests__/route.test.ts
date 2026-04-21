// GET + POST /api/scion/webhooks unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findManyMock = jest.fn<(args?: unknown) => Promise<unknown[]>>();
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
    webhookConfig: {
      findMany: (args?: unknown) =>
        (findManyMock as unknown as (a?: unknown) => Promise<unknown[]>)(args),
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

import { GET, POST } from "../route";

const admin: IapUser = {
  id: "a",
  email: "admin@x",
  name: null,
  role: "ADMIN",
};

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/scion/webhooks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  findManyMock.mockReset();
  createMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("audit-1");
});

describe("GET /api/scion/webhooks", () => {
  it("redacts secret to '***' + last4 in every row", async () => {
    const now = new Date("2026-02-01T00:00:00Z");
    findManyMock.mockResolvedValue([
      {
        id: "wh-1",
        name: "ops-notify",
        endpoint: "https://hooks.example.com/a",
        secret: "super-duper-long-secret-ABCD",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "wh-2",
        name: "short",
        endpoint: "https://hooks.example.com/b",
        secret: "tinysecret1234567", // last4 = "4567"
        isActive: false,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      webhooks: Array<{
        id: string;
        secretPreview: string;
        isActive: boolean;
      }>;
    };
    expect(body.webhooks).toHaveLength(2);
    expect(body.webhooks[0].secretPreview).toBe("***ABCD");
    expect(body.webhooks[1].secretPreview).toBe("***4567");
    // Raw secret must never appear in response JSON anywhere.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("super-duper-long-secret-ABCD");
    expect(raw).not.toContain("tinysecret1234567");
  });

  it("returns empty list when table is empty", async () => {
    findManyMock.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { webhooks: unknown[] };
    expect(body.webhooks).toEqual([]);
  });

  it("500 when prisma throws", async () => {
    findManyMock.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/scion/webhooks", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST(
      postReq({
        name: "n",
        endpoint: "https://x.example.com/",
        secret: "0123456789abcdef",
      }),
    );
    expect(res.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await POST(
      postReq({
        name: "n",
        endpoint: "https://x.example.com/",
        secret: "0123456789abcdef",
      }),
    );
    expect(res.status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("400 when name is missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(
      postReq({
        endpoint: "https://x.example.com/",
        secret: "0123456789abcdef",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when endpoint is missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(postReq({ name: "n", secret: "0123456789abcdef" }));
    expect(res.status).toBe(400);
  });

  it("400 when endpoint is not a URL", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(
      postReq({
        name: "n",
        endpoint: "not-a-url",
        secret: "0123456789abcdef",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when endpoint is http:// on a non-localhost host", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(
      postReq({
        name: "n",
        endpoint: "http://evil.example.com/hook",
        secret: "0123456789abcdef",
      }),
    );
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("accepts http://localhost endpoint", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const now = new Date("2026-02-01T00:00:00Z");
    createMock.mockResolvedValue({
      id: "wh-local",
      name: "dev",
      endpoint: "http://localhost:3000/hook",
      secret: "0123456789abcdef",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const res = await POST(
      postReq({
        name: "dev",
        endpoint: "http://localhost:3000/hook",
        secret: "0123456789abcdef",
      }),
    );
    expect(res.status).toBe(201);
  });

  it("400 when secret is shorter than 16 chars", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(
      postReq({
        name: "n",
        endpoint: "https://x.example.com/",
        secret: "tooshort",
      }),
    );
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("201 creates + audits with redacted secret preview (never raw)", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const now = new Date("2026-02-02T00:00:00Z");
    const RAW = "a-really-long-secret-XYZZ";
    createMock.mockResolvedValue({
      id: "wh-new",
      name: "ops-notify",
      endpoint: "https://hooks.example.com/a",
      secret: RAW,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const res = await POST(
      postReq({
        name: "ops-notify",
        endpoint: "https://hooks.example.com/a",
        secret: RAW,
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      webhook: { id: string; secretPreview: string };
    };
    expect(body.ok).toBe(true);
    expect(body.webhook.secretPreview).toBe("***XYZZ");
    expect(JSON.stringify(body)).not.toContain(RAW);

    expect(writeMock).toHaveBeenCalledTimes(1);
    const auditArg = writeMock.mock.calls[0]?.[0] as {
      content: {
        payload: { secretPreview?: string; secret?: unknown };
      };
    };
    // Audit payload MUST NOT include the raw secret, but must include the preview.
    expect(auditArg.content.payload.secretPreview).toBe("***XYZZ");
    expect(auditArg.content.payload.secret).toBeUndefined();
    expect(JSON.stringify(auditArg)).not.toContain(RAW);
  });
});
