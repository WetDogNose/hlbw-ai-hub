// Pass 22 — POST /api/scion/heartbeat-now unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";
import type { DispatchResult } from "@/lib/orchestration/dispatcher";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const reclaimMock = jest.fn<() => Promise<number>>();
const dispatchMock = jest.fn<(n?: number) => Promise<DispatchResult[]>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/orchestration/dispatcher", () => ({
  __esModule: true,
  reclaimStaleWorkers: () =>
    (reclaimMock as unknown as () => Promise<number>)(),
  dispatchReadyIssues: (limit?: number) =>
    (dispatchMock as unknown as (n?: number) => Promise<DispatchResult[]>)(
      limit,
    ),
}));

jest.mock("@/lib/orchestration/memory/PgvectorMemoryStore", () => ({
  __esModule: true,
  getPgvectorMemoryStore: () => ({
    write: (ep: unknown) =>
      (writeMock as unknown as (e: unknown) => Promise<string>)(ep),
  }),
}));

import { POST } from "../route";

function req(body: unknown = {}): Request {
  return new Request("http://localhost/api/scion/heartbeat-now", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  reclaimMock.mockReset();
  dispatchMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("m-1");
});

describe("POST /api/scion/heartbeat-now", () => {
  it("401 when unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("403 when role is USER", async () => {
    getIapUserMock.mockResolvedValue({
      id: "u",
      email: "u@x",
      name: "u",
      role: "USER",
    });
    const res = await POST(req());
    expect(res.status).toBe(403);
  });

  it("200 and writes an audit row when admin", async () => {
    getIapUserMock.mockResolvedValue({
      id: "a",
      email: "a@x",
      name: "A",
      role: "ADMIN",
    });
    reclaimMock.mockResolvedValue(2);
    dispatchMock.mockResolvedValue([]);
    const res = await POST(req({ limit: 3 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staleReclaimed).toBe(2);
    expect(body.dispatched).toEqual([]);
    expect(dispatchMock).toHaveBeenCalledWith(3);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("500 when reclaim throws", async () => {
    getIapUserMock.mockResolvedValue({
      id: "a",
      email: "a@x",
      name: "A",
      role: "ADMIN",
    });
    reclaimMock.mockRejectedValue(new Error("db"));
    dispatchMock.mockResolvedValue([]);
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});
