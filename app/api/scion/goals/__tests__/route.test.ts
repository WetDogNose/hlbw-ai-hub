// GET + POST /api/scion/goals unit tests.
//
// Uses the same mock-prisma pattern as the other SCION route tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findManyMock = jest.fn<(args: unknown) => Promise<unknown[]>>();
const createMock = jest.fn<(args: unknown) => Promise<unknown>>();
const orgFindFirstMock = jest.fn<(args: unknown) => Promise<unknown>>();
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
    goal: {
      findMany: (args: unknown) =>
        (findManyMock as unknown as (a: unknown) => Promise<unknown[]>)(args),
      create: (args: unknown) =>
        (createMock as unknown as (a: unknown) => Promise<unknown>)(args),
    },
    organization: {
      findFirst: (args: unknown) =>
        (orgFindFirstMock as unknown as (a: unknown) => Promise<unknown>)(args),
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
  return new Request("http://localhost/api/scion/goals", {
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
  writeMock.mockResolvedValue("m-1");
});

describe("GET /api/scion/goals", () => {
  it("200 returns goals with aggregate counts", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "g-1",
        description: "Ship v1",
        organizationId: "org-1",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
        issues: [
          { status: "completed" },
          { status: "completed" },
          { status: "in_progress" },
          { status: "pending" },
        ],
      },
      {
        id: "g-2",
        description: "Nothing yet",
        organizationId: "org-1",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        issues: [],
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      goals: Array<{
        id: string;
        issueCounts: { total: number; completed: number; in_progress: number };
      }>;
    };
    expect(body.goals).toHaveLength(2);
    expect(body.goals[0].issueCounts).toEqual({
      total: 4,
      completed: 2,
      in_progress: 1,
    });
    expect(body.goals[1].issueCounts).toEqual({
      total: 0,
      completed: 0,
      in_progress: 0,
    });
  });

  it("500 when prisma throws", async () => {
    findManyMock.mockRejectedValue(new Error("db exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/scion/goals", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST(postReq({ description: "Anything" }));
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await POST(postReq({ description: "Anything" }));
    expect(res.status).toBe(403);
  });

  it("400 on empty description", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(postReq({ description: "   " }));
    expect(res.status).toBe(400);
  });

  it("400 when description missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it("201 + audit when admin creates a goal", async () => {
    getIapUserMock.mockResolvedValue(admin);
    orgFindFirstMock.mockResolvedValue({ id: "org-sys" });
    createMock.mockResolvedValue({
      id: "g-new",
      description: "Launch Paperclip",
      organizationId: "org-sys",
      createdAt: new Date("2026-04-21T00:00:00Z"),
      updatedAt: new Date("2026-04-21T00:00:00Z"),
    });
    const res = await POST(postReq({ description: "Launch Paperclip" }));
    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as {
      goal: { id: string; description: string };
    };
    expect(body.goal.id).toBe("g-new");
    expect(body.goal.description).toBe("Launch Paperclip");
  });

  it("creates the system org when absent", async () => {
    getIapUserMock.mockResolvedValue(admin);
    orgFindFirstMock.mockResolvedValue(null);
    orgCreateMock.mockResolvedValue({ id: "org-brand-new" });
    createMock.mockResolvedValue({
      id: "g-new",
      description: "Seed",
      organizationId: "org-brand-new",
      createdAt: new Date("2026-04-21T00:00:00Z"),
      updatedAt: new Date("2026-04-21T00:00:00Z"),
    });
    const res = await POST(postReq({ description: "Seed" }));
    expect(res.status).toBe(201);
    expect(orgCreateMock).toHaveBeenCalledTimes(1);
  });
});
