// GET + POST /api/scion/personas unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findManyMock = jest.fn<(args?: unknown) => Promise<unknown[]>>();
const createMock = jest.fn<(args: unknown) => Promise<unknown>>();
const orgFindFirstMock = jest.fn<(args?: unknown) => Promise<unknown | null>>();
const orgCreateMock = jest.fn<(args: unknown) => Promise<unknown>>();
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
      findMany: (args?: unknown) =>
        (findManyMock as unknown as (a?: unknown) => Promise<unknown[]>)(args),
      create: (args: unknown) =>
        (createMock as unknown as (a: unknown) => Promise<unknown>)(args),
    },
    organization: {
      findFirst: (args?: unknown) =>
        (
          orgFindFirstMock as unknown as (
            a?: unknown,
          ) => Promise<unknown | null>
        )(args),
      create: (args: unknown) =>
        (orgCreateMock as unknown as (a: unknown) => Promise<unknown>)(args),
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
  email: "a@x",
  name: null,
  role: "ADMIN",
};

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/scion/personas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  findManyMock.mockReset();
  createMock.mockReset();
  orgFindFirstMock.mockReset();
  orgCreateMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("audit-1");
});

describe("GET /api/scion/personas", () => {
  it("lists personas with aggregated issue + token counts", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    findManyMock.mockResolvedValue([
      {
        id: "p-1",
        name: "cto-owl",
        role: "CTO",
        status: "IDLE",
        organizationId: "org-1",
        createdAt: now,
        updatedAt: now,
        issues: [
          { status: "pending" },
          { status: "in_progress" },
          { status: "completed" },
        ],
        ledgers: [{ tokensUsed: 100 }, { tokensUsed: 250 }],
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      personas: Array<{
        id: string;
        name: string;
        assignedIssues: number;
        openIssues: number;
        tokensSpent: number;
      }>;
    };
    expect(body.personas).toHaveLength(1);
    expect(body.personas[0]).toMatchObject({
      id: "p-1",
      name: "cto-owl",
      assignedIssues: 3,
      openIssues: 2,
      tokensSpent: 350,
    });
    // Confirm the system persona filter was applied.
    expect(findManyMock).toHaveBeenCalledTimes(1);
    const call = findManyMock.mock.calls[0]?.[0] as {
      where?: { name?: { not?: string } };
    };
    expect(call?.where?.name?.not).toBe("__system");
  });

  it("returns empty list when no personas exist", async () => {
    findManyMock.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { personas: unknown[] };
    expect(body.personas).toEqual([]);
  });

  it("500 when prisma throws", async () => {
    findManyMock.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/scion/personas", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST(postReq({ name: "a", role: "QA" }));
    expect(res.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await POST(postReq({ name: "a", role: "QA" }));
    expect(res.status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("400 when name is missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(postReq({ role: "QA" }));
    expect(res.status).toBe(400);
  });

  it("400 when role is missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(postReq({ name: "a" }));
    expect(res.status).toBe(400);
  });

  it("400 when name is the reserved __system handle", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(postReq({ name: "__system", role: "SYSTEM" }));
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("201 creates persona + resolves system org + audits", async () => {
    getIapUserMock.mockResolvedValue(admin);
    orgFindFirstMock.mockResolvedValue(null);
    orgCreateMock.mockResolvedValue({ id: "org-1", name: "__system" });
    const now = new Date("2026-01-02T00:00:00Z");
    createMock.mockResolvedValue({
      id: "p-new",
      name: "cto-owl",
      role: "CTO",
      status: "IDLE",
      organizationId: "org-1",
      createdAt: now,
      updatedAt: now,
    });

    const res = await POST(postReq({ name: "cto-owl", role: "CTO" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      persona: { id: string; organizationId: string };
    };
    expect(body.ok).toBe(true);
    expect(body.persona.id).toBe("p-new");
    expect(body.persona.organizationId).toBe("org-1");
    expect(orgCreateMock).toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("201 reuses existing __system org if present", async () => {
    getIapUserMock.mockResolvedValue(admin);
    orgFindFirstMock.mockResolvedValue({
      id: "org-existing",
      name: "__system",
    });
    const now = new Date("2026-01-02T00:00:00Z");
    createMock.mockResolvedValue({
      id: "p-new",
      name: "qa-sentry",
      role: "QA",
      status: "IDLE",
      organizationId: "org-existing",
      createdAt: now,
      updatedAt: now,
    });
    const res = await POST(postReq({ name: "qa-sentry", role: "QA" }));
    expect(res.status).toBe(201);
    expect(orgCreateMock).not.toHaveBeenCalled();
    const createArgs = createMock.mock.calls[0]?.[0] as {
      data: { organizationId: string };
    };
    expect(createArgs?.data?.organizationId).toBe("org-existing");
  });
});
