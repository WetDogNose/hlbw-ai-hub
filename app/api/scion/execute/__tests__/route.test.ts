// Pass 16 — /api/scion/execute unit tests.
//
// Verifies: validation, budget-ceiling 429, and happy-path Issue creation.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

const threadCreate =
  jest.fn<
    (args: unknown) => Promise<{ id: string; issues: Array<{ id: string }> }>
  >();
const assertBudget = jest.fn<() => Promise<number>>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    thread: {
      create: (args: unknown) =>
        (
          threadCreate as unknown as (
            a: unknown,
          ) => Promise<{ id: string; issues: Array<{ id: string }> }>
        )(args),
    },
  },
}));

jest.mock("@/lib/orchestration/budget", () => {
  class BudgetExceededError extends Error {
    readonly status = 429;
    constructor(message: string) {
      super(message);
      this.name = "BudgetExceededError";
    }
  }
  return {
    __esModule: true,
    assertBudgetAvailable: () =>
      (assertBudget as unknown as () => Promise<number>)(),
    BudgetExceededError,
  };
});

import { POST } from "../route";

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/scion/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/scion/execute", () => {
  beforeEach(() => {
    threadCreate.mockReset();
    assertBudget.mockReset();
    assertBudget.mockResolvedValue(0);
  });

  it("rejects when agentName is missing", async () => {
    const res = await POST(postReq({ instruction: "x" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/agent name/i);
  });

  it("rejects when instruction is missing", async () => {
    const res = await POST(postReq({ agentName: "qa" }));
    expect(res.status).toBe(400);
  });

  it("returns 429 when budget ceiling exceeded", async () => {
    const { BudgetExceededError } = jest.requireMock(
      "@/lib/orchestration/budget",
    ) as { BudgetExceededError: new (msg: string) => Error };
    assertBudget.mockRejectedValue(
      new BudgetExceededError("Budget Interception"),
    );

    const res = await POST(
      postReq({ agentName: "qa", instruction: "do stuff" }),
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/Budget Interception/);
    expect(threadCreate).not.toHaveBeenCalled();
  });

  it("creates an Issue and returns issueId", async () => {
    threadCreate.mockResolvedValue({
      id: "t-1",
      issues: [{ id: "i-1" }],
    });

    const res = await POST(
      postReq({
        agentName: "qa-sentry",
        instruction: "Run QA pass",
        agentCategory: "1_qa",
        priority: 8,
        dependencies: ["i-0"],
        blockedBy: [],
        metadata: { source: "dashboard" },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issueId).toBe("i-1");
    expect(body.threadId).toBe("t-1");

    expect(threadCreate).toHaveBeenCalledTimes(1);
    const arg = threadCreate.mock.calls[0]![0] as {
      data: {
        title: string;
        issues: {
          create: {
            instruction: string;
            status: string;
            priority: number;
            agentCategory: string;
            dependencies: string[];
          };
        };
      };
    };
    expect(arg.data.title).toMatch(/qa-sentry/);
    expect(arg.data.issues.create.status).toBe("pending");
    expect(arg.data.issues.create.priority).toBe(8);
    expect(arg.data.issues.create.agentCategory).toBe("1_qa");
    expect(arg.data.issues.create.dependencies).toEqual(["i-0"]);
  });

  it('defaults agentCategory to "default" and priority to 5', async () => {
    threadCreate.mockResolvedValue({
      id: "t-2",
      issues: [{ id: "i-2" }],
    });

    const res = await POST(
      postReq({ agentName: "ops", instruction: "Deploy" }),
    );
    expect(res.status).toBe(200);
    const arg = threadCreate.mock.calls[0]![0] as {
      data: {
        issues: {
          create: { agentCategory: string; priority: number };
        };
      };
    };
    expect(arg.data.issues.create.agentCategory).toBe("default");
    expect(arg.data.issues.create.priority).toBe(5);
  });
});
