// Pass 8 — StateGraph unit tests.
//
// All DB access is mocked via `jest.mock('@/lib/prisma')`. The mock
// implements the slice of the Prisma client the StateGraph touches:
//   - `taskGraphState.findUnique` / `.create` / `.update`
//   - `$transaction(async (tx) => ...)`  — serialized in-memory queue
//   - `$queryRaw`                         — returns the in-memory row
//
// The serialization of $transaction models the FOR UPDATE lock: concurrent
// `transition()` calls on the same issueId observe each other's committed
// state rather than racing.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

// ---------------------------------------------------------------------------
// In-memory Prisma mock
// ---------------------------------------------------------------------------

type Row = {
  id: string;
  issueId: string;
  currentNode: string;
  status: "running" | "paused" | "interrupted" | "completed" | "failed";
  context: Record<string, unknown>;
  history: Array<Record<string, unknown>>;
  interruptReason: string | null;
  lastTransitionAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

const store = new Map<string, Row>();
let txQueue: Promise<unknown> = Promise.resolve();

function cloneRow(r: Row): Row {
  return {
    ...r,
    context: JSON.parse(JSON.stringify(r.context)) as Record<string, unknown>,
    history: JSON.parse(JSON.stringify(r.history)) as Array<
      Record<string, unknown>
    >,
    lastTransitionAt: new Date(r.lastTransitionAt),
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  };
}

const txClient = {
  taskGraphState: {
    findUnique: async ({
      where,
    }: {
      where: { issueId: string };
    }): Promise<Row | null> => {
      const r = store.get(where.issueId);
      return r ? cloneRow(r) : null;
    },
    create: async ({
      data,
    }: {
      data: {
        issueId: string;
        currentNode: string;
        status?: Row["status"];
        context?: Record<string, unknown>;
        history?: Array<Record<string, unknown>>;
        interruptReason?: string | null;
        lastTransitionAt?: Date;
      };
    }): Promise<Row> => {
      if (store.has(data.issueId)) {
        throw new Error("unique constraint");
      }
      const now = new Date();
      const row: Row = {
        id: `tgs_${data.issueId}`,
        issueId: data.issueId,
        currentNode: data.currentNode,
        status: data.status ?? "running",
        context: data.context ?? {},
        history: data.history ?? [],
        interruptReason: data.interruptReason ?? null,
        lastTransitionAt: data.lastTransitionAt ?? now,
        createdAt: now,
        updatedAt: now,
      };
      store.set(data.issueId, row);
      return cloneRow(row);
    },
    update: async ({
      where,
      data,
    }: {
      where: { issueId: string };
      data: Partial<Row>;
    }): Promise<Row> => {
      const current = store.get(where.issueId);
      if (!current) throw new Error("row not found");
      const next: Row = {
        ...current,
        ...(data as Partial<Row>),
        updatedAt: new Date(),
      };
      store.set(where.issueId, next);
      return cloneRow(next);
    },
  },
  $queryRaw: async (
    queryOrStrings: unknown,
    ...rest: unknown[]
  ): Promise<Row[]> => {
    // `prisma.$queryRaw` accepts either a TemplateStringsArray (tagged
    // template form) or a `Prisma.Sql` instance (produced by `Prisma.sql`).
    // StateGraph.lockRowForUpdate passes the latter: one argument, an object
    // exposing a `values` getter. The mock doesn't care about the SQL text;
    // it just extracts the interpolated issueId and looks the row up.
    let issueId: string | undefined;
    if (
      queryOrStrings &&
      typeof queryOrStrings === "object" &&
      "values" in (queryOrStrings as Record<string, unknown>)
    ) {
      const vals = (queryOrStrings as { values: unknown[] }).values;
      issueId = vals[0] as string;
    } else {
      issueId = rest[0] as string;
    }
    if (!issueId) return [];
    const r = store.get(issueId);
    return r ? [cloneRow(r)] : [];
  },
};

const prismaMock = {
  ...txClient,
  $transaction: <T>(cb: (tx: typeof txClient) => Promise<T>): Promise<T> => {
    // Serialize transactions to model the FOR UPDATE lock.
    const run = async (): Promise<T> => cb(txClient);
    const next = txQueue.then(run, run);
    // Prevent the queue from rejecting once and blocking everyone forever.
    txQueue = next.catch(() => undefined);
    return next;
  },
};

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: prismaMock,
}));

// ---------------------------------------------------------------------------
// Pass 18 — OTEL tracer spy. Captures span name + attributes set during
// each transition() call so the tests below can assert the observability
// contract without booting a real SDK.
// ---------------------------------------------------------------------------

interface CapturedSpan {
  name: string;
  attributes: Record<string, unknown>;
  exceptions: unknown[];
  ended: boolean;
  setAttribute: (k: string, v: unknown) => CapturedSpan;
  setAttributes: (attrs: Record<string, unknown>) => CapturedSpan;
  updateName: (n: string) => CapturedSpan;
  recordException: (e: unknown) => void;
  end: () => void;
}

const capturedSpans: CapturedSpan[] = [];

function makeFakeSpan(initialName: string): CapturedSpan {
  const span: CapturedSpan = {
    name: initialName,
    attributes: {},
    exceptions: [],
    ended: false,
    setAttribute(k, v) {
      span.attributes[k] = v;
      return span;
    },
    setAttributes(attrs) {
      Object.assign(span.attributes, attrs);
      return span;
    },
    updateName(n) {
      span.name = n;
      return span;
    },
    recordException(e) {
      span.exceptions.push(e);
    },
    end() {
      span.ended = true;
    },
  };
  return span;
}

jest.mock("@/lib/orchestration/tracing/tracer", () => ({
  __esModule: true,
  getOrchestratorTracer: () => ({
    startActiveSpan: <T>(name: string, fn: (span: CapturedSpan) => T): T => {
      const span = makeFakeSpan(name);
      capturedSpans.push(span);
      return fn(span);
    },
  }),
}));

// ---------------------------------------------------------------------------
// Pass 19 — TurnCritic mock. Captures recordTurn snapshots per transition.
// ---------------------------------------------------------------------------

interface RecordedTurn {
  taskId: string;
  issueId: string;
  node: string;
  role: string;
  stateHash: string;
  action: { kind: string; summary: string };
  outcome: string;
  durationMs: number;
  modelId: string;
  timestamp: string;
}

const recordedTurns: RecordedTurn[] = [];
let recordTurnShouldThrow = false;

jest.mock("@/lib/rl", () => {
  const actual = jest.requireActual<typeof import("@/lib/rl")>("@/lib/rl");
  return {
    __esModule: true,
    ...actual,
    getTurnCritic: () => ({
      name: "test-fake",
      async recordTurn(snap: RecordedTurn) {
        recordedTurns.push(snap);
        if (recordTurnShouldThrow) {
          throw new Error("turn critic broken");
        }
      },
      async estimateValue() {
        return 0;
      },
      async computeAdvantage() {
        return [];
      },
    }),
  };
});

// Import AFTER the mocks register so StateGraph binds to the mocks.
import { StateGraph } from "../StateGraph";
import type { Node, NodeOutcome } from "../types";
import { SPAN_ATTR } from "@/lib/orchestration/tracing/attrs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(
  name: string,
  run: (ctx: Record<string, unknown>) => Promise<NodeOutcome>,
): Node {
  return { name, run };
}

beforeEach(() => {
  store.clear();
  txQueue = Promise.resolve();
  capturedSpans.length = 0;
  recordedTurns.length = 0;
  recordTurnShouldThrow = false;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StateGraph", () => {
  it("constructor rejects when startNode is not in the nodes map", () => {
    expect(
      () =>
        new StateGraph({
          startNode: "missing",
          nodes: {
            a: makeNode("a", async () => ({ kind: "complete" })),
          },
        }),
    ).toThrow(/startNode/);
  });

  it("start() creates a running row at the startNode", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => ({ kind: "complete" })),
      },
    });
    const row = await graph.start("issue-1", { seeded: 1 });
    expect(row.issueId).toBe("issue-1");
    expect(row.status).toBe("running");
    expect(row.currentNode).toBe("a");
    expect(row.context).toEqual({ seeded: 1 });
    expect(row.history).toEqual([]);
  });

  it("start() refuses to create a second row for the same issueId", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => ({ kind: "complete" })),
      },
    });
    await graph.start("issue-dup");
    await expect(graph.start("issue-dup")).rejects.toThrow(/already exists/);
  });

  it("get() returns null when no row exists", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: { a: makeNode("a", async () => ({ kind: "complete" })) },
    });
    const row = await graph.get("nope");
    expect(row).toBeNull();
  });

  it("get() returns the row after start()", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: { a: makeNode("a", async () => ({ kind: "complete" })) },
    });
    await graph.start("issue-get");
    const row = await graph.get("issue-get");
    expect(row?.currentNode).toBe("a");
  });

  it("transition() advances currentNode on goto outcome", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => ({
          kind: "goto",
          next: "b",
          contextPatch: { aRan: true },
        })),
        b: makeNode("b", async () => ({ kind: "complete" })),
      },
    });
    await graph.start("issue-goto", { seeded: "x" });
    const { stateAfter, outcome } = await graph.transition("issue-goto");
    expect(outcome.kind).toBe("goto");
    expect(stateAfter.currentNode).toBe("b");
    expect(stateAfter.status).toBe("running");
    expect(stateAfter.context).toEqual({ seeded: "x", aRan: true });
    expect(Array.isArray(stateAfter.history)).toBe(true);
    const history = stateAfter.history as Array<Record<string, unknown>>;
    expect(history).toHaveLength(1);
    expect(history[0].node).toBe("a");
    expect(history[0].outcome).toBe("ok");
  });

  it("transition() rejects goto to an undefined node", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => ({ kind: "goto", next: "ghost" })),
      },
    });
    await graph.start("issue-ghost");
    await expect(graph.transition("issue-ghost")).rejects.toThrow(/ghost/);
  });

  it("transition() sets status=interrupted on interrupt outcome", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => ({
          kind: "interrupt",
          reason: "awaiting_human_review",
        })),
      },
    });
    await graph.start("issue-int");
    const { stateAfter } = await graph.transition("issue-int");
    expect(stateAfter.status).toBe("interrupted");
    expect(stateAfter.interruptReason).toBe("awaiting_human_review");
    const history = stateAfter.history as Array<Record<string, unknown>>;
    expect(history[0].outcome).toBe("interrupt");
    expect(history[0].detail).toBe("awaiting_human_review");
  });

  it("transition() sets status=completed on complete outcome", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => ({
          kind: "complete",
          contextPatch: { done: true },
        })),
      },
    });
    await graph.start("issue-done");
    const { stateAfter } = await graph.transition("issue-done");
    expect(stateAfter.status).toBe("completed");
    expect(stateAfter.context).toEqual({ done: true });
  });

  it("transition() sets status=failed on error outcome and records error in history", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => ({
          kind: "error",
          error: new Error("boom"),
        })),
      },
    });
    await graph.start("issue-fail");
    const { stateAfter } = await graph.transition("issue-fail");
    expect(stateAfter.status).toBe("failed");
    const history = stateAfter.history as Array<Record<string, unknown>>;
    expect(history[0].outcome).toBe("error");
    expect(history[0].detail).toBe("boom");
  });

  it("transition() coerces a thrown exception into a failed status", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => {
          throw new Error("node blew up");
        }),
      },
    });
    await graph.start("issue-throw");
    const { stateAfter, outcome } = await graph.transition("issue-throw");
    expect(stateAfter.status).toBe("failed");
    expect(outcome.kind).toBe("error");
    const history = stateAfter.history as Array<Record<string, unknown>>;
    expect(history[0].detail).toBe("node blew up");
  });

  it("transition() throws when status is interrupted", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => ({ kind: "interrupt", reason: "pause" })),
      },
    });
    await graph.start("issue-paused");
    await graph.transition("issue-paused"); // -> interrupted
    await expect(graph.transition("issue-paused")).rejects.toThrow(
      /cannot transition from status=interrupted/,
    );
  });

  it("transition() throws when status is paused (manually set)", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: { a: makeNode("a", async () => ({ kind: "complete" })) },
    });
    await graph.start("issue-manual-pause");
    // Simulate an external pause by flipping the stored row directly.
    const row = store.get("issue-manual-pause")!;
    row.status = "paused";
    await expect(graph.transition("issue-manual-pause")).rejects.toThrow(
      /cannot transition from status=paused/,
    );
  });

  it("transition() throws when no row exists for the issue", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: { a: makeNode("a", async () => ({ kind: "complete" })) },
    });
    await expect(graph.transition("missing")).rejects.toThrow(
      /no task_graph_state row/,
    );
  });

  it("resume() flips interrupted back to running", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => ({
          kind: "interrupt",
          reason: "awaiting",
        })),
      },
    });
    await graph.start("issue-resume");
    await graph.transition("issue-resume");
    const resumed = await graph.resume("issue-resume");
    expect(resumed.status).toBe("running");
    expect(resumed.interruptReason).toBeNull();
  });

  it("resume() refuses to flip a running row", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: { a: makeNode("a", async () => ({ kind: "complete" })) },
    });
    await graph.start("issue-running");
    await expect(graph.resume("issue-running")).rejects.toThrow(
      /cannot resume from status=running/,
    );
  });

  it("resume() throws when no row exists", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: { a: makeNode("a", async () => ({ kind: "complete" })) },
    });
    await expect(graph.resume("nope")).rejects.toThrow(/no task_graph_state/);
  });

  it("interrupt() marks the row interrupted with the given reason", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: { a: makeNode("a", async () => ({ kind: "complete" })) },
    });
    await graph.start("issue-ext-int");
    const row = await graph.interrupt("issue-ext-int", "external_kill");
    expect(row.status).toBe("interrupted");
    expect(row.interruptReason).toBe("external_kill");
  });

  it("interrupt() throws when no row exists", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: { a: makeNode("a", async () => ({ kind: "complete" })) },
    });
    await expect(graph.interrupt("nope", "why")).rejects.toThrow(
      /no task_graph_state/,
    );
  });

  it("transition() is atomic: two concurrent calls observe serialized state", async () => {
    // Node a: goto b. Node b: goto c. Node c: complete.
    // If both concurrent transition() calls ran against the original row,
    // they would both try to advance from "a" and the final state would
    // be wrong. With the serialized $transaction mock, the second call
    // observes the first caller's update and advances from "b" to "c".
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => ({ kind: "goto", next: "b" })),
        b: makeNode("b", async () => ({ kind: "goto", next: "c" })),
        c: makeNode("c", async () => ({ kind: "complete" })),
      },
    });
    await graph.start("issue-atomic");

    const [t1, t2] = await Promise.all([
      graph.transition("issue-atomic"),
      graph.transition("issue-atomic"),
    ]);

    // One caller saw node a, the other saw node b. Neither saw node c.
    const nodesSeen = [
      (t1.stateAfter.history as Array<Record<string, unknown>>).at(-1)!.node,
      (t2.stateAfter.history as Array<Record<string, unknown>>).at(-1)!.node,
    ].sort();
    expect(nodesSeen).toEqual(["a", "b"]);

    const final = await graph.get("issue-atomic");
    expect(final?.currentNode).toBe("c");
    expect(final?.status).toBe("running");
    expect((final?.history as Array<unknown>).length).toBe(2);
  });

  it("transition() rejects when the currentNode is no longer defined in the graph", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: { a: makeNode("a", async () => ({ kind: "complete" })) },
    });
    await graph.start("issue-stale");
    // Mutate the stored row so currentNode points at a node the graph no
    // longer defines. Models a code change between runs.
    const row = store.get("issue-stale")!;
    row.currentNode = "dropped";
    await expect(graph.transition("issue-stale")).rejects.toThrow(/"dropped"/);
  });

  // -------------------------------------------------------------------------
  // Pass 18 — OTEL span contract on transition().
  // -------------------------------------------------------------------------

  it("transition() opens a span named Graph:<node> with the standardized attrs", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => ({
          kind: "goto",
          next: "b",
          contextPatch: { agentCategory: "1_qa" },
        })),
        b: makeNode("b", async () => ({ kind: "complete" })),
      },
    });
    await graph.start("issue-span", { agentCategory: "1_qa" });
    await graph.transition("issue-span");

    // Pass 19 adds an additional `RL:recordTurn` span, so the transition
    // span is no longer the only entry in the buffer. We locate it by name.
    const graphSpan = capturedSpans.find((s) => s.name === "Graph:a");
    expect(graphSpan).toBeDefined();
    const span = graphSpan!;
    expect(span.ended).toBe(true);
    expect(span.attributes[SPAN_ATTR.TASK_ID]).toBe("issue-span");
    expect(span.attributes[SPAN_ATTR.NODE]).toBe("a");
    expect(span.attributes[SPAN_ATTR.NODE_OUTCOME]).toBe("goto");
    expect(span.attributes[SPAN_ATTR.AGENT_CATEGORY]).toBe("1_qa");
  });

  it("transition() ends the span on error outcome and records the exception", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => {
          throw new Error("explosion");
        }),
      },
    });
    await graph.start("issue-span-err");
    const { outcome } = await graph.transition("issue-span-err");
    expect(outcome.kind).toBe("error");

    const graphSpan = capturedSpans.find((s) => s.name === "Graph:a");
    expect(graphSpan).toBeDefined();
    const span = graphSpan!;
    expect(span.ended).toBe(true);
    expect(span.attributes[SPAN_ATTR.NODE_OUTCOME]).toBe("error");
    expect(span.exceptions.length).toBeGreaterThanOrEqual(1);
  });

  it("transition() ends the span when $transaction throws (missing row)", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: { a: makeNode("a", async () => ({ kind: "complete" })) },
    });
    await expect(graph.transition("missing-row")).rejects.toThrow(
      /no task_graph_state/,
    );
    // Pass 19 — the RL:recordTurn span fires even on error paths, so the
    // total span count is 2 (Graph:transition + RL:recordTurn).
    expect(capturedSpans.length).toBeGreaterThanOrEqual(1);
    for (const s of capturedSpans) {
      expect(s.ended).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // Pass 19 — Turn-PPO seam: recordTurn invoked once per transition.
  // -------------------------------------------------------------------------

  it("transition() calls recordTurn exactly once on the success path", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => ({
          kind: "goto",
          next: "b",
          contextPatch: { modelId: "stub-model" },
        })),
        b: makeNode("b", async () => ({ kind: "complete" })),
      },
    });
    await graph.start("issue-rl-1", { modelId: "stub-model" });
    await graph.transition("issue-rl-1");
    expect(recordedTurns).toHaveLength(1);
    const snap = recordedTurns[0];
    expect(snap.taskId).toBe("issue-rl-1");
    expect(snap.issueId).toBe("issue-rl-1");
    expect(snap.node).toBe("a");
    expect(snap.role).toBe("orchestrator");
    expect(snap.action.kind).toBe("goto");
    expect(snap.action.summary).toBe("goto:b");
    expect(snap.outcome).toBe("ok");
    expect(snap.modelId).toBe("stub-model");
    expect(snap.stateHash).toHaveLength(16);
    expect(typeof snap.durationMs).toBe("number");
  });

  it("transition() calls recordTurn with outcome=error on thrown exception", async () => {
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => {
          throw new Error("kaboom");
        }),
      },
    });
    await graph.start("issue-rl-2");
    await graph.transition("issue-rl-2");
    expect(recordedTurns).toHaveLength(1);
    expect(recordedTurns[0].outcome).toBe("error");
    expect(recordedTurns[0].action.kind).toBe("error");
    expect(recordedTurns[0].action.summary).toMatch(/kaboom/);
  });

  it("transition() still returns when recordTurn throws", async () => {
    recordTurnShouldThrow = true;
    const graph = new StateGraph({
      startNode: "a",
      nodes: {
        a: makeNode("a", async () => ({ kind: "complete" })),
      },
    });
    await graph.start("issue-rl-3");
    const { stateAfter } = await graph.transition("issue-rl-3");
    expect(stateAfter.status).toBe("completed");
    expect(recordedTurns).toHaveLength(1);
  });
});
