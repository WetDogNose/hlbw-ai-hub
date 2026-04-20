// Pass 18 — GET /api/scion/traces unit tests.
//
// Mocks the `summaries` module so the route test is isolated from the
// DB join logic (covered separately in summaries.test.ts).

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { TraceSummary } from "../../../../../lib/orchestration/tracing/summaries";

const fetchSummaries =
  jest.fn<
    (opts: { taskId?: string; limit?: number }) => Promise<TraceSummary[]>
  >();

jest.mock("@/lib/orchestration/tracing/summaries", () => ({
  __esModule: true,
  fetchRecentTraceSummaries: (opts: { taskId?: string; limit?: number }) =>
    (
      fetchSummaries as unknown as (o: {
        taskId?: string;
        limit?: number;
      }) => Promise<TraceSummary[]>
    )(opts),
}));

import { GET } from "../route";

function req(url: string = "http://localhost/api/scion/traces"): Request {
  return new Request(url, { method: "GET" });
}

function mkSummary(id: string): TraceSummary {
  return {
    taskId: id,
    rootSpanName: "Graph:root",
    startedAt: "2026-04-19T00:00:00.000Z",
    durationMs: 1000,
    status: "ok",
    nodeCount: 2,
    modelIds: [],
    totalTokens: { input: 0, output: 10 },
  };
}

beforeEach(() => {
  fetchSummaries.mockReset();
});

describe("GET /api/scion/traces", () => {
  it("returns summaries mapped into { traces: [...] }", async () => {
    fetchSummaries.mockResolvedValue([mkSummary("a"), mkSummary("b")]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.traces)).toBe(true);
    expect(body.traces).toHaveLength(2);
    expect(body.traces[0].taskId).toBe("a");
  });

  it("clamps limit to the MAX_LIMIT ceiling", async () => {
    fetchSummaries.mockResolvedValue([]);
    await GET(req("http://localhost/api/scion/traces?limit=999"));
    expect(fetchSummaries).toHaveBeenCalledWith({ limit: 50 });
  });

  it("forwards issueId as taskId when provided", async () => {
    fetchSummaries.mockResolvedValue([]);
    await GET(req("http://localhost/api/scion/traces?issueId=xyz&limit=3"));
    expect(fetchSummaries).toHaveBeenCalledWith({ taskId: "xyz", limit: 3 });
  });

  it("uses the default limit when no ?limit", async () => {
    fetchSummaries.mockResolvedValue([]);
    await GET(req());
    expect(fetchSummaries).toHaveBeenCalledWith({ limit: 10 });
  });

  it("returns 500 when the summary module throws", async () => {
    fetchSummaries.mockRejectedValue(new Error("db gone"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/db gone/);
  });
});
