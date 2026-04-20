// Pass 23 — GET /api/scion/budget unit tests.
//
// Admin 200 / non-admin 403 / unauth 401 / invalid groupBy 400.
// Aggregation fidelity via a canned queryRaw return.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const queryRawMock = jest.fn<(q: unknown) => Promise<unknown[]>>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    $queryRaw: (q: unknown) =>
      (queryRawMock as unknown as (x: unknown) => Promise<unknown[]>)(q),
  },
}));

import { GET } from "../route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

function req(qs: string = ""): Request {
  return new Request(`http://localhost/api/scion/budget${qs}`);
}

beforeEach(() => {
  getIapUserMock.mockReset();
  queryRawMock.mockReset();
});

describe("GET /api/scion/budget", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await GET(req("?groupBy=task"));
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await GET(req("?groupBy=task"));
    expect(res.status).toBe(403);
  });

  it("400 invalid groupBy", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await GET(req("?groupBy=bogus"));
    expect(res.status).toBe(400);
  });

  it("200 returns rows from the aggregate query", async () => {
    getIapUserMock.mockResolvedValue(admin);
    queryRawMock.mockResolvedValue([
      {
        label: "issue-1",
        total_tokens: BigInt(1000),
        total_calls: BigInt(3),
      },
      {
        label: "issue-2",
        total_tokens: BigInt(500),
        total_calls: BigInt(1),
      },
    ]);
    const res = await GET(req("?groupBy=task"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      groupBy: string;
      rows: Array<{ label: string; totalTokens: number; totalCalls: number }>;
    };
    expect(body.groupBy).toBe("task");
    expect(body.rows).toEqual([
      { label: "issue-1", totalTokens: 1000, totalCalls: 3 },
      { label: "issue-2", totalTokens: 500, totalCalls: 1 },
    ]);
  });

  it("defaults to groupBy=task when absent", async () => {
    getIapUserMock.mockResolvedValue(admin);
    queryRawMock.mockResolvedValue([]);
    const res = await GET(req(""));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { groupBy: string };
    expect(body.groupBy).toBe("task");
  });
});
