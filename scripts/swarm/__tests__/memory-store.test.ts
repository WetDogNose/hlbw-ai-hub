// Pass 7 — unit test for the shared-memory → MemoryStore adapter path.
//
// Mocks `@/lib/orchestration/memory/PgvectorMemoryStore` so no Prisma/DB
// interaction occurs. Confirms `shareTaskContext` routes through
// `MemoryStore.write` with the expected kind and taskId scope.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

const writeMock = jest
  .fn<(ep: unknown) => Promise<string>>()
  .mockResolvedValue("mem-1");
const queryByKindMock = jest
  .fn<(kind: string, limit?: number) => Promise<unknown[]>>()
  .mockResolvedValue([]);
const closeMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock("@/lib/orchestration/memory/PgvectorMemoryStore", () => {
  return {
    __esModule: true,
    PgvectorMemoryStore: jest.fn().mockImplementation(() => ({
      write: writeMock,
      queryByKind: queryByKindMock,
      queryByTask: jest.fn(),
      queryBySimilarity: jest.fn(),
      close: closeMock,
    })),
    getPgvectorMemoryStore: () => ({
      write: writeMock,
      queryByKind: queryByKindMock,
      queryByTask: jest.fn(),
      queryBySimilarity: jest.fn(),
      close: closeMock,
    }),
  };
});

jest.mock("@/lib/orchestration/memory/Neo4jReadAdapter", () => ({
  __esModule: true,
  Neo4jReadAdapter: jest.fn().mockImplementation(() => ({
    write: jest.fn(),
    queryByKind: queryByKindMock,
    queryByTask: jest.fn(),
    queryBySimilarity: jest.fn(),
    close: closeMock,
  })),
}));

// Audit and tracing would otherwise try to open WebSocket/OTEL exporters.
jest.mock("../audit", () => ({
  __esModule: true,
  appendAudit: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../tracing", () => ({
  __esModule: true,
  getTracer: () => ({
    startActiveSpan: (_name: string, fn: (span: unknown) => unknown) =>
      fn({
        setAttribute: () => undefined,
        recordException: () => undefined,
        end: () => undefined,
      }),
  }),
}));

import {
  shareTaskContext,
  shareDiscovery,
  shareDecision,
  getSharedContext,
  closeMemoryClient,
} from "../shared-memory";

describe("shared-memory adapter over MemoryStore", () => {
  beforeEach(() => {
    writeMock.mockClear();
    queryByKindMock.mockClear();
    closeMock.mockClear();
  });

  it("shareTaskContext writes a task_context episode scoped to taskId", async () => {
    await shareTaskContext(
      "issue-123",
      "Fix the thing",
      "Descriptive detail",
      "feat/the-thing",
    );

    expect(writeMock).toHaveBeenCalledTimes(1);
    const payload = writeMock.mock.calls[0][0] as {
      kind: string;
      taskId: string | null;
      summary: string;
    };
    expect(payload.kind).toBe("task_context");
    expect(payload.taskId).toBe("issue-123");
    expect(payload.summary).toContain("task:issue-123");
  });

  it("shareDiscovery writes discovery + relation episodes", async () => {
    await shareDiscovery("worker-9", "issue-55", "found a bug");

    // One for the discovery, one for the relation.
    expect(writeMock).toHaveBeenCalledTimes(2);
    const kinds = writeMock.mock.calls.map(
      (c) => (c[0] as { kind: string }).kind,
    );
    expect(kinds).toContain("discovery");
    expect(kinds).toContain("relation");
  });

  it("shareDecision writes decision + relation episodes scoped to taskId", async () => {
    await shareDecision("issue-77", "use pgvector", "single DB, simpler ops");

    expect(writeMock).toHaveBeenCalledTimes(2);
    const decisionCall = writeMock.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === "decision",
    );
    expect(decisionCall).toBeDefined();
    const decisionPayload = decisionCall![0] as {
      taskId: string | null;
    };
    expect(decisionPayload.taskId).toBe("issue-77");
  });

  it("getSharedContext merges episodes from multiple kinds", async () => {
    queryByKindMock.mockImplementation(async (kind: string) => {
      return [
        {
          id: `id-${kind}`,
          taskId: null,
          kind,
          agentCategory: null,
          content: {},
          summary: `summary-${kind}`,
          createdAt: new Date(),
        },
      ];
    });

    const context = await getSharedContext("whatever");
    expect(context.length).toBeGreaterThan(0);
    expect(context.some((line) => line.includes("discovery"))).toBe(true);
  });

  it("closeMemoryClient closes the write store", async () => {
    // Force lazy-init of the write store by calling a writer first.
    await shareTaskContext("t1", "x", "y", "z");
    await closeMemoryClient();
    expect(closeMock).toHaveBeenCalled();
  });
});
