// GET + POST /api/scion/routines unit tests.
//
// Follows the prisma-mock pattern used by app/api/scion/goals/__tests__/.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findManyMock = jest.fn<(args: unknown) => Promise<unknown[]>>();
const createMock = jest.fn<(args: unknown) => Promise<unknown>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    routine: {
      findMany: (args: unknown) =>
        (findManyMock as unknown as (a: unknown) => Promise<unknown[]>)(args),
      create: (args: unknown) =>
        (createMock as unknown as (a: unknown) => Promise<unknown>)(args),
    },
  },
}));

jest.mock("@/lib/orchestration/memory/PgvectorMemoryStore", () => ({
  __esModule: true,
  getPgvectorMemoryStore: () => ({
    write: (ep: unknown) =>
      (writeMock as unknown as (e: unknown) => Promise<string>)(ep),
  }),
}));

import { GET, POST, isValidCronExpression, parseTaskPayload } from "../route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/scion/routines", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  findManyMock.mockReset();
  createMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("m-1");
});

describe("isValidCronExpression (helper)", () => {
  it("accepts classic 5-field expressions", () => {
    expect(isValidCronExpression("*/5 * * * *")).toBe(true);
    expect(isValidCronExpression("0 0 * * *")).toBe(true);
    expect(isValidCronExpression("15 2,14 * * 1-5")).toBe(true);
    expect(isValidCronExpression("0 0 1 JAN *")).toBe(true);
  });

  it("rejects non-5-field or garbage", () => {
    expect(isValidCronExpression("")).toBe(false);
    expect(isValidCronExpression("every minute pls")).toBe(false);
    expect(isValidCronExpression("* * * *")).toBe(false); // 4 fields
    expect(isValidCronExpression("* * * * * *")).toBe(false); // 6 fields
    expect(isValidCronExpression("@hourly")).toBe(false);
    expect(isValidCronExpression("* * * * $")).toBe(false);
  });
});

describe("parseTaskPayload (helper)", () => {
  it("accepts an object with agentName + instruction", () => {
    const parsed = parseTaskPayload({
      agentName: "a",
      instruction: "do the thing",
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.agentName).toBe("a");
    expect(parsed?.instruction).toBe("do the thing");
  });

  it("accepts JSON-string form", () => {
    const parsed = parseTaskPayload(
      JSON.stringify({ agentName: "a", instruction: "i" }),
    );
    expect(parsed?.agentName).toBe("a");
  });

  it("rejects missing agentName / instruction", () => {
    expect(parseTaskPayload({ agentName: "a" })).toBeNull();
    expect(parseTaskPayload({ instruction: "i" })).toBeNull();
    expect(parseTaskPayload({ agentName: "", instruction: "i" })).toBeNull();
    expect(parseTaskPayload({ agentName: "a", instruction: " " })).toBeNull();
  });

  it("rejects malformed JSON strings", () => {
    expect(parseTaskPayload("not json at all")).toBeNull();
    expect(parseTaskPayload("[1,2,3]")).toBeNull();
    expect(parseTaskPayload("null")).toBeNull();
  });
});

describe("GET /api/scion/routines", () => {
  it("200 returns routines most-recently-updated first", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "r-1",
        cronExpression: "*/5 * * * *",
        taskPayload: '{"agentName":"a","instruction":"i"}',
        isActive: true,
        lastRunAt: new Date("2026-04-20T12:00:00Z"),
        createdAt: new Date("2026-04-01T00:00:00Z"),
        updatedAt: new Date("2026-04-20T12:00:00Z"),
      },
      {
        id: "r-2",
        cronExpression: "0 0 * * *",
        taskPayload: '{"agentName":"b","instruction":"i2"}',
        isActive: false,
        lastRunAt: null,
        createdAt: new Date("2026-04-10T00:00:00Z"),
        updatedAt: new Date("2026-04-10T00:00:00Z"),
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      routines: Array<{
        id: string;
        cronExpression: string;
        isActive: boolean;
        lastRunAt: string | null;
      }>;
    };
    expect(body.routines).toHaveLength(2);
    expect(body.routines[0].id).toBe("r-1");
    expect(body.routines[0].isActive).toBe(true);
    expect(body.routines[1].lastRunAt).toBeNull();
    // orderBy was passed with updatedAt desc.
    const call = findManyMock.mock.calls[0][0] as {
      orderBy: Array<{ updatedAt?: string }>;
    };
    expect(call.orderBy[0].updatedAt).toBe("desc");
  });

  it("500 when prisma throws", async () => {
    findManyMock.mockRejectedValue(new Error("db exploded"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/scion/routines", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST(
      postReq({
        cronExpression: "*/5 * * * *",
        taskPayload: { agentName: "a", instruction: "i" },
      }),
    );
    expect(res.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await POST(
      postReq({
        cronExpression: "*/5 * * * *",
        taskPayload: { agentName: "a", instruction: "i" },
      }),
    );
    expect(res.status).toBe(403);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("400 when cronExpression is not 5 fields", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(
      postReq({
        cronExpression: "@hourly",
        taskPayload: { agentName: "a", instruction: "i" },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/5 space-separated/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("400 when cronExpression has illegal characters", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(
      postReq({
        cronExpression: "* * * * $",
        taskPayload: { agentName: "a", instruction: "i" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when taskPayload missing agentName", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(
      postReq({
        cronExpression: "0 0 * * *",
        taskPayload: { instruction: "do it" },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/agentName/);
  });

  it("400 when taskPayload is a malformed JSON string", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await POST(
      postReq({
        cronExpression: "0 0 * * *",
        taskPayload: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("201 + audit on happy path (object payload)", async () => {
    getIapUserMock.mockResolvedValue(admin);
    createMock.mockResolvedValue({
      id: "r-new",
      cronExpression: "*/5 * * * *",
      taskPayload: '{"agentName":"a","instruction":"i","extra":1}',
      isActive: true,
      lastRunAt: null,
      createdAt: new Date("2026-04-21T00:00:00Z"),
      updatedAt: new Date("2026-04-21T00:00:00Z"),
    });
    const res = await POST(
      postReq({
        cronExpression: "*/5 * * * *",
        taskPayload: { agentName: "a", instruction: "i", extra: 1 },
      }),
    );
    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledTimes(1);
    const createArgs = createMock.mock.calls[0][0] as {
      data: { taskPayload: string; isActive: boolean };
    };
    // Stored as stringified JSON.
    expect(typeof createArgs.data.taskPayload).toBe("string");
    expect(JSON.parse(createArgs.data.taskPayload)).toEqual({
      agentName: "a",
      instruction: "i",
      extra: 1,
    });
    // Default isActive is true.
    expect(createArgs.data.isActive).toBe(true);
    // Audit was stamped.
    expect(writeMock).toHaveBeenCalledTimes(1);
    const auditArgs = writeMock.mock.calls[0][0] as {
      summary: string;
      content: {
        action: string;
        payload: { routineId: string; cronExpression: string };
      };
    };
    expect(auditArgs.summary).toContain("routine.create");
    expect(auditArgs.content.action).toBe("routine.create");
    expect(auditArgs.content.payload.routineId).toBe("r-new");

    const body = (await res.json()) as {
      routine: { id: string; isActive: boolean };
    };
    expect(body.routine.id).toBe("r-new");
    expect(body.routine.isActive).toBe(true);
  });

  it("201 accepts JSON-string taskPayload", async () => {
    getIapUserMock.mockResolvedValue(admin);
    createMock.mockResolvedValue({
      id: "r-str",
      cronExpression: "0 * * * *",
      taskPayload: '{"agentName":"b","instruction":"i"}',
      isActive: true,
      lastRunAt: null,
      createdAt: new Date("2026-04-21T00:00:00Z"),
      updatedAt: new Date("2026-04-21T00:00:00Z"),
    });
    const res = await POST(
      postReq({
        cronExpression: "0 * * * *",
        taskPayload: JSON.stringify({ agentName: "b", instruction: "i" }),
      }),
    );
    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("201 respects explicit isActive=false", async () => {
    getIapUserMock.mockResolvedValue(admin);
    createMock.mockResolvedValue({
      id: "r-off",
      cronExpression: "0 * * * *",
      taskPayload: '{"agentName":"a","instruction":"i"}',
      isActive: false,
      lastRunAt: null,
      createdAt: new Date("2026-04-21T00:00:00Z"),
      updatedAt: new Date("2026-04-21T00:00:00Z"),
    });
    const res = await POST(
      postReq({
        cronExpression: "0 * * * *",
        taskPayload: { agentName: "a", instruction: "i" },
        isActive: false,
      }),
    );
    expect(res.status).toBe(201);
    const createArgs = createMock.mock.calls[0][0] as {
      data: { isActive: boolean };
    };
    expect(createArgs.data.isActive).toBe(false);
  });
});
