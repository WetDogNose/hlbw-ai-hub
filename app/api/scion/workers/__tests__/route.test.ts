// Pass 21 — GET /api/scion/workers unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { LiveWorker } from "@/lib/orchestration/introspection";

const listLiveWorkersMock = jest.fn<() => Promise<LiveWorker[]>>();

jest.mock("@/lib/orchestration/introspection", () => ({
  __esModule: true,
  listLiveWorkers: () =>
    (listLiveWorkersMock as unknown as () => Promise<LiveWorker[]>)(),
}));

import { GET } from "../route";

function mkWorker(overrides: Partial<LiveWorker> = {}): LiveWorker {
  return {
    containerId: "abc",
    name: "hlbw-worker-warm-4_db-1",
    image: "hlbw-ai-hub:latest",
    status: "running",
    ports: ["3000/tcp"],
    startedAt: "2026-04-20T00:00:00Z",
    category: "4_db",
    currentIssueId: null,
    uptimeSeconds: 60,
    ...overrides,
  };
}

beforeEach(() => {
  listLiveWorkersMock.mockReset();
});

describe("GET /api/scion/workers", () => {
  it("returns { workers: [] } when docker returns nothing", async () => {
    listLiveWorkersMock.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.workers).toEqual([]);
  });

  it("forwards parsed worker rows", async () => {
    listLiveWorkersMock.mockResolvedValue([
      mkWorker({ name: "hlbw-worker-warm-4_db-1" }),
      mkWorker({
        containerId: "def",
        name: "hlbw-worker-warm-1_qa-2",
        category: "1_qa",
      }),
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workers).toHaveLength(2);
    expect(body.workers[0].category).toBe("4_db");
    expect(body.workers[1].category).toBe("1_qa");
  });

  it("returns 500 when the introspection module throws", async () => {
    listLiveWorkersMock.mockRejectedValue(new Error("docker fail"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
