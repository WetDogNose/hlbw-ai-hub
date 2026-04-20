// Pass 22 — POST /api/scion/issue/[id]/resume unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findUniqueMock = jest.fn<(args: unknown) => Promise<unknown>>();
const updateMock = jest.fn<(args: unknown) => Promise<unknown>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();
const spawnWorkerMock =
  jest.fn<
    (
      id: string,
      instr: string,
      branch: string,
      cat: string,
    ) => Promise<{ workerId: string }>
  >();

// Fake StateGraph.resume — avoid pulling in the real Prisma stack.
const resumeMock = jest.fn<(id: string) => Promise<{ status: string }>>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    issue: {
      findUnique: (args: unknown) =>
        (findUniqueMock as unknown as (a: unknown) => Promise<unknown>)(args),
      update: (args: unknown) =>
        (updateMock as unknown as (a: unknown) => Promise<unknown>)(args),
    },
  },
}));

jest.mock("@/lib/orchestration/graph", () => ({
  __esModule: true,
  defineGraph: () => ({
    resume: (id: string) =>
      (resumeMock as unknown as (i: string) => Promise<{ status: string }>)(id),
  }),
}));

jest.mock("@/lib/orchestration/dispatcher", () => ({
  __esModule: true,
  spawnWorkerSubprocess: (
    id: string,
    instr: string,
    branch: string,
    cat: string,
  ) =>
    (
      spawnWorkerMock as unknown as (
        a: string,
        b: string,
        c: string,
        d: string,
      ) => Promise<{ workerId: string }>
    )(id, instr, branch, cat),
}));

jest.mock("@/lib/orchestration/memory/PgvectorMemoryStore", () => ({
  __esModule: true,
  getPgvectorMemoryStore: () => ({
    write: (ep: unknown) =>
      (writeMock as unknown as (e: unknown) => Promise<string>)(ep),
  }),
}));

import { POST } from "../route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

function req(): Request {
  return new Request("http://localhost/api/scion/issue/i-1/resume", {
    method: "POST",
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  findUniqueMock.mockReset();
  updateMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("m-1");
  updateMock.mockResolvedValue({});
  spawnWorkerMock.mockReset();
  spawnWorkerMock.mockResolvedValue({ workerId: "w-1" });
  resumeMock.mockReset();
  resumeMock.mockResolvedValue({ status: "running" });
});

describe("POST /api/scion/issue/[id]/resume", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST(req(), { params: { id: "i-1" } });
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await POST(req(), { params: { id: "i-1" } });
    expect(res.status).toBe(403);
  });

  it("409 when no graph state", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({
      id: "i-1",
      instruction: "x",
      agentCategory: "1_qa",
      graphState: null,
    });
    const res = await POST(req(), { params: { id: "i-1" } });
    expect(res.status).toBe(409);
  });

  it("200 + worker spawned + audit when admin", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({
      id: "i-1",
      instruction: "x",
      agentCategory: "1_qa",
      graphState: { status: "interrupted", currentNode: "execute_step" },
    });
    const res = await POST(req(), { params: { id: "i-1" } });
    expect(res.status).toBe(200);
    expect(spawnWorkerMock).toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
