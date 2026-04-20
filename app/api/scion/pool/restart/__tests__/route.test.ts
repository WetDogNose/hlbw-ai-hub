// Pass 22 — POST /api/scion/pool/restart + GET /[jobId] unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { EventEmitter } from "node:events";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();
const spawnMock = jest.fn<(...args: unknown[]) => unknown>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("node:child_process", () => ({
  __esModule: true,
  spawn: (...args: unknown[]) =>
    (spawnMock as unknown as (...a: unknown[]) => unknown)(...args),
}));

jest.mock("@/lib/orchestration/memory/PgvectorMemoryStore", () => ({
  __esModule: true,
  getPgvectorMemoryStore: () => ({
    write: (ep: unknown) =>
      (writeMock as unknown as (e: unknown) => Promise<string>)(ep),
  }),
}));

function mkFakeChild(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

import { POST } from "../route";
import { GET as GET_JOB } from "../[jobId]/route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

beforeEach(() => {
  getIapUserMock.mockReset();
  writeMock.mockReset();
  spawnMock.mockReset();
  writeMock.mockResolvedValue("m-1");
  spawnMock.mockImplementation(() => mkFakeChild());
});

describe("POST /api/scion/pool/restart", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("202 + jobId when admin", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST();
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(typeof body.jobId).toBe("string");
    expect(body.status).toBe("running");
    expect(writeMock).toHaveBeenCalledTimes(1);
    // Round-trip the job lookup through the sibling GET route.
    const lookup = await GET_JOB(
      new Request(`http://localhost/api/scion/pool/restart/${body.jobId}`, {
        method: "GET",
      }),
      { params: { jobId: body.jobId } },
    );
    expect(lookup.status).toBe(200);
    const job = await lookup.json();
    expect(job.id).toBe(body.jobId);
  });

  it("404 from GET on unknown jobId", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const lookup = await GET_JOB(
      new Request("http://localhost/api/scion/pool/restart/does-not-exist", {
        method: "GET",
      }),
      { params: { jobId: "does-not-exist" } },
    );
    expect(lookup.status).toBe(404);
  });
});
