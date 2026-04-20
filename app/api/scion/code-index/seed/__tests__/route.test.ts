// Pass 24 — POST /api/scion/code-index/seed + GET /[jobId] unit tests.

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

function req(body: unknown): Request {
  return new Request("http://localhost/api/scion/code-index/seed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  writeMock.mockReset();
  spawnMock.mockReset();
  writeMock.mockResolvedValue("m-1");
  spawnMock.mockImplementation(() => mkFakeChild());
});

describe("POST /api/scion/code-index/seed", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await POST(req({}));
    expect(res.status).toBe(403);
  });

  it("400 when paths contain invalid entries", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({ paths: ["../etc/passwd"] }));
    expect(res.status).toBe(400);
  });

  it("202 + jobId when admin; audit row written", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({}));
    expect(res.status).toBe(202);
    const body = (await res.json()) as { jobId: string; status: string };
    expect(typeof body.jobId).toBe("string");
    expect(body.status).toBe("running");
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("202 when reembed+dryRun flags pass through", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({ reembed: true, dryRun: true }));
    expect(res.status).toBe(202);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const spawnArgs = spawnMock.mock.calls[0][1] as string[];
    expect(spawnArgs).toContain("--reembed");
    expect(spawnArgs).toContain("--dry-run");
  });

  it("GET /[jobId] returns job record round-trip", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({}));
    const body = (await res.json()) as { jobId: string };
    const lookup = await GET_JOB(
      new Request(`http://localhost/api/scion/code-index/seed/${body.jobId}`, {
        method: "GET",
      }),
      { params: { jobId: body.jobId } },
    );
    expect(lookup.status).toBe(200);
    const job = (await lookup.json()) as { id: string };
    expect(job.id).toBe(body.jobId);
  });

  it("GET /[jobId] returns 404 for unknown jobId", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const lookup = await GET_JOB(
      new Request("http://localhost/api/scion/code-index/seed/nope", {
        method: "GET",
      }),
      { params: { jobId: "nope" } },
    );
    expect(lookup.status).toBe(404);
  });
});
