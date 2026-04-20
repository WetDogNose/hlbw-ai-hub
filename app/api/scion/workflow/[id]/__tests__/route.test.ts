// Pass 21 — GET /api/scion/workflow/[id] unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { WorkflowSnapshot } from "@/lib/orchestration/introspection";

const getWorkflowMock =
  jest.fn<(id: string) => Promise<WorkflowSnapshot | null>>();

jest.mock("@/lib/orchestration/introspection", () => ({
  __esModule: true,
  getWorkflow: (id: string) =>
    (
      getWorkflowMock as unknown as (
        i: string,
      ) => Promise<WorkflowSnapshot | null>
    )(id),
}));

import { GET } from "../route";

function mkSnapshot(id: string): WorkflowSnapshot {
  return {
    issueId: id,
    status: "in_progress",
    currentNode: "execute_step",
    graphStatus: "running",
    topology: {
      nodes: ["init_mcp", "build_context"],
      edges: [{ from: "init_mcp", to: "build_context" }],
    },
    history: [
      {
        node: "init_mcp",
        enteredAt: "2026-04-20T00:00:00Z",
        exitedAt: "2026-04-20T00:00:01Z",
        outcome: "ok",
        durationMs: 1000,
      },
      {
        node: "execute_step",
        enteredAt: "2026-04-20T00:00:02Z",
        exitedAt: "2026-04-20T00:00:03Z",
        outcome: "ok",
        durationMs: 1000,
      },
      {
        node: "execute_step",
        enteredAt: "2026-04-20T00:00:04Z",
        exitedAt: "2026-04-20T00:00:05Z",
        outcome: "ok",
        durationMs: 1000,
      },
    ],
    cycleCounts: {
      init_mcp: 0,
      execute_step: 1,
    },
  };
}

function req(id: string): Request {
  return new Request(`http://localhost/api/scion/workflow/${id}`, {
    method: "GET",
  });
}

beforeEach(() => {
  getWorkflowMock.mockReset();
});

describe("GET /api/scion/workflow/[id]", () => {
  it("returns 404 when the workflow snapshot is null", async () => {
    getWorkflowMock.mockResolvedValue(null);
    const res = await GET(req("missing"), { params: { id: "missing" } });
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns the WorkflowSnapshot with Cache-Control no-store", async () => {
    const snap = mkSnapshot("i-1");
    getWorkflowMock.mockResolvedValue(snap);
    const res = await GET(req("i-1"), { params: { id: "i-1" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as WorkflowSnapshot;
    expect(body.issueId).toBe("i-1");
    expect(body.cycleCounts.execute_step).toBe(1);
    expect(body.history).toHaveLength(3);
  });

  it("supports the Promise-shaped params contract (Next 15+ routes)", async () => {
    getWorkflowMock.mockResolvedValue(mkSnapshot("i-2"));
    const res = await GET(req("i-2"), {
      params: Promise.resolve({ id: "i-2" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as WorkflowSnapshot;
    expect(body.issueId).toBe("i-2");
  });

  it("returns 400 when id is empty", async () => {
    const res = await GET(req(""), { params: { id: "" } });
    expect(res.status).toBe(400);
  });

  it("returns 500 when getWorkflow throws", async () => {
    getWorkflowMock.mockRejectedValue(new Error("db err"));
    const res = await GET(req("i-3"), { params: { id: "i-3" } });
    expect(res.status).toBe(500);
  });
});
