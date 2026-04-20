// Pass 21 — GET /api/scion/memory unit tests.
//
// Mocks the Prisma client's memoryEpisode.findMany and verifies cursor
// pagination, kind filtering, and default limits.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

type MemoryRowDb = {
  id: string;
  taskId: string | null;
  kind: string;
  agentCategory: string | null;
  summary: string;
  content: unknown;
  createdAt: Date;
};

const memoryFindMany = jest.fn<(args: unknown) => Promise<MemoryRowDb[]>>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    memoryEpisode: {
      findMany: (args: unknown) =>
        (memoryFindMany as unknown as (a: unknown) => Promise<MemoryRowDb[]>)(
          args,
        ),
    },
  },
}));

import { GET } from "../route";

function mkRow(overrides: Partial<MemoryRowDb>): MemoryRowDb {
  return {
    id: "m-1",
    taskId: null,
    kind: "observation",
    agentCategory: "default",
    summary: "summary",
    content: { note: "x" },
    createdAt: new Date("2026-04-20T00:00:00Z"),
    ...overrides,
  };
}

function req(url: string = "http://localhost/api/scion/memory"): Request {
  return new Request(url, { method: "GET" });
}

beforeEach(() => {
  memoryFindMany.mockReset();
});

describe("GET /api/scion/memory", () => {
  it("returns a page of rows with nextCursor:null when under limit", async () => {
    memoryFindMany.mockResolvedValue([mkRow({ id: "m-1" })]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
    expect(body.rows[0].kind).toBe("observation");
  });

  it("filters by kind when ?kind=decision is a valid kind", async () => {
    memoryFindMany.mockResolvedValue([]);
    await GET(req("http://localhost/api/scion/memory?kind=decision"));
    const call = memoryFindMany.mock.calls[0][0] as { where: { kind: string } };
    expect(call.where.kind).toBe("decision");
  });

  it("ignores an invalid ?kind value", async () => {
    memoryFindMany.mockResolvedValue([]);
    await GET(req("http://localhost/api/scion/memory?kind=bogus"));
    const call = memoryFindMany.mock.calls[0][0] as { where: object };
    expect(call.where).toEqual({});
  });

  it("advances cursor pagination when more rows exist", async () => {
    const rows: MemoryRowDb[] = [];
    for (let i = 0; i < 26; i++) rows.push(mkRow({ id: `m-${i}` }));
    memoryFindMany.mockResolvedValue(rows);
    const res = await GET(req("http://localhost/api/scion/memory?limit=25"));
    const body = await res.json();
    expect(body.rows).toHaveLength(25);
    expect(body.nextCursor).toBe("m-24");
  });

  it("returns 500 when Prisma throws", async () => {
    memoryFindMany.mockRejectedValue(new Error("db err"));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});
