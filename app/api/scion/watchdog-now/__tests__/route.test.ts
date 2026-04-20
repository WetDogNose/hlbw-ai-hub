// Pass 22 — POST /api/scion/watchdog-now unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const reclaimMock = jest.fn<() => Promise<number>>();
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
}));

jest.mock("@/lib/orchestration/memory/PgvectorMemoryStore", () => ({
  __esModule: true,
  getPgvectorMemoryStore: () => ({
    write: (ep: unknown) =>
      (writeMock as unknown as (e: unknown) => Promise<string>)(ep),
  }),
}));

import { POST } from "../route";

beforeEach(() => {
  getIapUserMock.mockReset();
  reclaimMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("m-1");
});

describe("POST /api/scion/watchdog-now", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({
      id: "u",
      email: "u@x",
      name: null,
      role: "USER",
    });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("200 + audit when admin", async () => {
    getIapUserMock.mockResolvedValue({
      id: "a",
      email: "a@x",
      name: null,
      role: "ADMIN",
    });
    reclaimMock.mockResolvedValue(4);
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reclaimed).toBe(4);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
