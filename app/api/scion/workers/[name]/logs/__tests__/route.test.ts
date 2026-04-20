// Pass 22 — GET /api/scion/workers/[name]/logs unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();
const spawnSyncMock = jest.fn<(...args: unknown[]) => unknown>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("node:child_process", () => ({
  __esModule: true,
  spawnSync: (...args: unknown[]) =>
    (spawnSyncMock as unknown as (...a: unknown[]) => unknown)(...args),
}));

jest.mock("@/lib/orchestration/memory/PgvectorMemoryStore", () => ({
  __esModule: true,
  getPgvectorMemoryStore: () => ({
    write: (ep: unknown) =>
      (writeMock as unknown as (e: unknown) => Promise<string>)(ep),
  }),
}));

import { GET } from "../route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

function req(name: string, qs: string = ""): Request {
  return new Request(
    `http://localhost/api/scion/workers/${encodeURIComponent(name)}/logs${qs}`,
    { method: "GET" },
  );
}

beforeEach(() => {
  getIapUserMock.mockReset();
  writeMock.mockReset();
  spawnSyncMock.mockReset();
  writeMock.mockResolvedValue("m-1");
  spawnSyncMock.mockReturnValue({
    status: 0,
    stdout: "hello",
    stderr: "",
  });
});

describe("GET /api/scion/workers/[name]/logs", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await GET(req("hlbw-worker-warm-4_db-1"), {
      params: { name: "hlbw-worker-warm-4_db-1" },
    });
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await GET(req("hlbw-worker-warm-4_db-1"), {
      params: { name: "hlbw-worker-warm-4_db-1" },
    });
    expect(res.status).toBe(403);
  });

  it("400 when container name fails the regex", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await GET(req("evil;rm"), { params: { name: "evil;rm" } });
    expect(res.status).toBe(400);
  });

  it("200 + stdout when admin", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await GET(req("hlbw-worker-warm-4_db-1"), {
      params: { name: "hlbw-worker-warm-4_db-1" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stdout).toBe("hello");
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
