// Pass 24 — POST /api/scion/workflow/[id]/force-transition unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();
const queryRawMock = jest.fn<(sql: unknown) => Promise<unknown[]>>();
const updateMock = jest.fn<(args: unknown) => Promise<unknown>>();
const transactionMock =
  jest.fn<(fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/prisma", () => {
  const client = {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      (
        transactionMock as unknown as (
          f: (tx: unknown) => Promise<unknown>,
        ) => Promise<unknown>
      )(fn),
    $queryRaw: (sql: unknown) =>
      (queryRawMock as unknown as (s: unknown) => Promise<unknown[]>)(sql),
    taskGraphState: {
      update: (args: unknown) =>
        (updateMock as unknown as (a: unknown) => Promise<unknown>)(args),
    },
  };
  return {
    __esModule: true,
    default: client,
  };
});

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

function req(body: unknown): Request {
  return new Request(
    "http://localhost/api/scion/workflow/i-1/force-transition",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  getIapUserMock.mockReset();
  writeMock.mockReset();
  queryRawMock.mockReset();
  updateMock.mockReset();
  transactionMock.mockReset();
  writeMock.mockResolvedValue("m-1");
  queryRawMock.mockResolvedValue([
    {
      issueId: "i-1",
      currentNode: "execute_step",
      status: "running",
      history: [],
    },
  ]);
  updateMock.mockResolvedValue({
    issueId: "i-1",
    currentNode: "propose_plan",
    status: "running",
  });
  transactionMock.mockImplementation(async (fn) => {
    const tx = {
      $queryRaw: (sql: unknown) =>
        (queryRawMock as unknown as (s: unknown) => Promise<unknown[]>)(sql),
      taskGraphState: {
        update: (args: unknown) =>
          (updateMock as unknown as (a: unknown) => Promise<unknown>)(args),
      },
    };
    return fn(tx);
  });
});

describe("POST /api/scion/workflow/[id]/force-transition", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST(req({ nextNode: "propose_plan", reason: "test" }), {
      params: { id: "i-1" },
    });
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await POST(req({ nextNode: "propose_plan", reason: "test" }), {
      params: { id: "i-1" },
    });
    expect(res.status).toBe(403);
  });

  it("400 when nextNode is not in topology", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({ nextNode: "bogus_node", reason: "test" }), {
      params: { id: "i-1" },
    });
    expect(res.status).toBe(400);
  });

  it("400 when reason is missing", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({ nextNode: "propose_plan" }), {
      params: { id: "i-1" },
    });
    expect(res.status).toBe(400);
  });

  it("200 with audit row when valid", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(req({ nextNode: "propose_plan", reason: "debug" }), {
      params: { id: "i-1" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { from: string; to: string };
    expect(body.from).toBe("execute_step");
    expect(body.to).toBe("propose_plan");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("500 (structured) when the transaction throws; failure audit logged", async () => {
    getIapUserMock.mockResolvedValue(admin);
    transactionMock.mockRejectedValueOnce(new Error("db kaboom"));
    const res = await POST(req({ nextNode: "propose_plan", reason: "debug" }), {
      params: { id: "i-1" },
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("db kaboom");
    // Failure audit row still written (workflow.force-transition.failed).
    expect(writeMock).toHaveBeenCalled();
  });
});
