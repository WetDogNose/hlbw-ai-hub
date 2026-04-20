// Pass 6 — heartbeat route unit tests.
//
// Mocks `@/lib/orchestration/dispatcher` so no DB, no Docker, no subprocess.
// Verifies the auth gate, the happy-path response shape, and the structured
// 500 path when the dispatcher rejects.

import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";

const mockReclaim = jest.fn<() => Promise<number>>();
const mockDispatch =
  jest.fn<
    (
      limit?: number,
    ) => Promise<
      Array<{ taskId: string; workerId: string | null; status: string }>
    >
  >();

jest.mock("@/lib/orchestration/dispatcher", () => ({
  __esModule: true,
  reclaimStaleWorkers: (...args: unknown[]) =>
    (mockReclaim as unknown as (...a: unknown[]) => Promise<number>)(...args),
  dispatchReadyIssues: (...args: unknown[]) =>
    (mockDispatch as unknown as (...a: unknown[]) => Promise<unknown>)(...args),
}));

// Import AFTER the mock is registered.
import { POST } from "../route";

function postReq(opts: {
  body?: unknown;
  headers?: Record<string, string>;
}): Request {
  return new Request("http://localhost/api/orchestrator/heartbeat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

describe("POST /api/orchestrator/heartbeat", () => {
  const originalSecret = process.env.ORCHESTRATOR_SHARED_SECRET;

  beforeEach(() => {
    mockReclaim.mockReset();
    mockDispatch.mockReset();
    mockReclaim.mockResolvedValue(0);
    mockDispatch.mockResolvedValue([]);
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.ORCHESTRATOR_SHARED_SECRET;
    } else {
      process.env.ORCHESTRATOR_SHARED_SECRET = originalSecret;
    }
  });

  it("returns 401 when secret env is set and request has no header", async () => {
    process.env.ORCHESTRATOR_SHARED_SECRET = "test-secret";
    const res = await POST(postReq({ body: {} }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
    expect(mockReclaim).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns the dispatch summary when the secret matches", async () => {
    process.env.ORCHESTRATOR_SHARED_SECRET = "test-secret";
    mockReclaim.mockResolvedValue(2);
    mockDispatch.mockResolvedValue([
      { taskId: "t-1", workerId: "w-1", status: "spawned" },
      { taskId: "t-2", workerId: "w-2", status: "spawned" },
    ]);

    const res = await POST(
      postReq({
        body: { limit: 2 },
        headers: { "x-orchestrator-secret": "test-secret" },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staleReclaimed).toBe(2);
    expect(body.dispatched).toHaveLength(2);
    expect(body.dispatched[0].taskId).toBe("t-1");
    expect(typeof body.elapsedMs).toBe("number");
    expect(body.unauthenticated).toBeUndefined();
    expect(mockDispatch).toHaveBeenCalledWith(2);
  });

  it("flags unauthenticated when no secret env is set (dev mode)", async () => {
    delete process.env.ORCHESTRATOR_SHARED_SECRET;
    mockReclaim.mockResolvedValue(0);
    mockDispatch.mockResolvedValue([]);

    const res = await POST(postReq({ body: {} }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unauthenticated).toBe(true);
  });

  it("returns structured 500 when dispatchReadyIssues rejects", async () => {
    process.env.ORCHESTRATOR_SHARED_SECRET = "test-secret";
    mockReclaim.mockResolvedValue(0);
    mockDispatch.mockRejectedValue(new Error("db down"));

    const res = await POST(
      postReq({
        body: {},
        headers: { "x-orchestrator-secret": "test-secret" },
      }),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/dispatchReadyIssues/);
    expect(body.detail).toBe("db down");
  });

  it("returns structured 500 when reclaimStaleWorkers rejects", async () => {
    process.env.ORCHESTRATOR_SHARED_SECRET = "test-secret";
    mockReclaim.mockRejectedValue(new Error("timeout"));

    const res = await POST(
      postReq({
        body: {},
        headers: { "x-orchestrator-secret": "test-secret" },
      }),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/reclaimStaleWorkers/);
    expect(body.detail).toBe("timeout");
  });

  it("defaults limit to 5 when body omits it", async () => {
    delete process.env.ORCHESTRATOR_SHARED_SECRET;
    mockReclaim.mockResolvedValue(0);
    mockDispatch.mockResolvedValue([]);

    await POST(postReq({ body: {} }));
    expect(mockDispatch).toHaveBeenCalledWith(5);
  });
});
