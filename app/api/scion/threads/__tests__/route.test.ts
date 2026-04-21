// GET + POST /api/scion/threads unit tests.
//
// Mocks the Prisma client's thread.findMany and thread.create, plus the
// admin auth guard + audit helpers, and verifies cursor pagination, default
// limits, and admin-only POST creation.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

type ThreadFindManyRow = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { issues: number };
  issues: Array<{ updatedAt: Date }>;
};

type ThreadCreateRow = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

const findManyMock = jest.fn<(args: unknown) => Promise<ThreadFindManyRow[]>>();
const createMock = jest.fn<(args: unknown) => Promise<ThreadCreateRow>>();
const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    thread: {
      findMany: (args: unknown) =>
        (
          findManyMock as unknown as (
            a: unknown,
          ) => Promise<ThreadFindManyRow[]>
        )(args),
      create: (args: unknown) =>
        (createMock as unknown as (a: unknown) => Promise<ThreadCreateRow>)(
          args,
        ),
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

import { GET, POST } from "../route";

const admin: IapUser = {
  id: "a",
  email: "admin@example.com",
  name: null,
  role: "ADMIN",
};

function mkRow(overrides: Partial<ThreadFindManyRow>): ThreadFindManyRow {
  return {
    id: "t-1",
    title: "Thread 1",
    createdAt: new Date("2026-04-20T00:00:00Z"),
    updatedAt: new Date("2026-04-21T00:00:00Z"),
    _count: { issues: 0 },
    issues: [],
    ...overrides,
  };
}

function getReq(url: string = "http://localhost/api/scion/threads"): Request {
  return new Request(url, { method: "GET" });
}

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/scion/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  findManyMock.mockReset();
  createMock.mockReset();
  getIapUserMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("audit-1");
});

describe("GET /api/scion/threads", () => {
  it("returns a page of rows with nextCursor:null when under limit", async () => {
    findManyMock.mockResolvedValue([
      mkRow({ id: "t-1", _count: { issues: 3 } }),
    ]);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as {
      rows: Array<{ id: string; issueCount: number; lastActivityAt: string }>;
      nextCursor: string | null;
    };
    expect(body.rows).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
    expect(body.rows[0].id).toBe("t-1");
    expect(body.rows[0].issueCount).toBe(3);
  });

  it("uses the latest issue updatedAt as lastActivityAt when present", async () => {
    const latest = new Date("2026-04-25T12:00:00Z");
    findManyMock.mockResolvedValue([
      mkRow({
        id: "t-1",
        _count: { issues: 1 },
        issues: [{ updatedAt: latest }],
      }),
    ]);
    const res = await GET(getReq());
    const body = (await res.json()) as {
      rows: Array<{ lastActivityAt: string }>;
    };
    expect(body.rows[0].lastActivityAt).toBe(latest.toISOString());
  });

  it("advances cursor pagination when more rows exist", async () => {
    const rows: ThreadFindManyRow[] = [];
    for (let i = 0; i < 26; i++) rows.push(mkRow({ id: `t-${i}` }));
    findManyMock.mockResolvedValue(rows);
    const res = await GET(
      getReq("http://localhost/api/scion/threads?limit=25"),
    );
    const body = (await res.json()) as {
      rows: unknown[];
      nextCursor: string | null;
    };
    expect(body.rows).toHaveLength(25);
    expect(body.nextCursor).toBe("t-24");
  });

  it("orders by updatedAt desc, id desc", async () => {
    findManyMock.mockResolvedValue([]);
    await GET(getReq());
    const call = findManyMock.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
    };
    expect(call.orderBy).toEqual([{ updatedAt: "desc" }, { id: "desc" }]);
  });

  it("applies cursor+skip when cursor is provided", async () => {
    findManyMock.mockResolvedValue([]);
    await GET(getReq("http://localhost/api/scion/threads?cursor=t-9"));
    const call = findManyMock.mock.calls[0][0] as {
      cursor?: { id: string };
      skip?: number;
    };
    expect(call.cursor).toEqual({ id: "t-9" });
    expect(call.skip).toBe(1);
  });

  it("returns 500 when Prisma throws", async () => {
    findManyMock.mockRejectedValue(new Error("db err"));
    const res = await GET(getReq());
    expect(res.status).toBe(500);
  });
});

describe("POST /api/scion/threads", () => {
  it("401 when unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST(postReq({ title: "hello" }));
    expect(res.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("403 when caller is not admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await POST(postReq({ title: "hello" }));
    expect(res.status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("400 when title is missing or empty", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const resMissing = await POST(postReq({}));
    expect(resMissing.status).toBe(400);
    const resEmpty = await POST(postReq({ title: "   " }));
    expect(resEmpty.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("400 when title is not a string", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(postReq({ title: 42 }));
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("200 + audit on successful create", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const now = new Date("2026-04-21T00:00:00Z");
    createMock.mockResolvedValue({
      id: "t-new",
      title: "My thread",
      createdAt: now,
      updatedAt: now,
    });
    const res = await POST(postReq({ title: "  My thread  " }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      thread: { id: string; title: string };
    };
    expect(body.ok).toBe(true);
    expect(body.thread.id).toBe("t-new");
    expect(body.thread.title).toBe("My thread");
    // Title was trimmed before write.
    const call = createMock.mock.calls[0][0] as { data: { title: string } };
    expect(call.data.title).toBe("My thread");
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("500 when prisma.create throws", async () => {
    getIapUserMock.mockResolvedValue(admin);
    createMock.mockRejectedValue(new Error("boom"));
    const res = await POST(postReq({ title: "x" }));
    expect(res.status).toBe(500);
  });
});
