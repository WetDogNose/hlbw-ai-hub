// Pass 19 — NoopTurnCritic unit tests.
//
// Mocks the MemoryStore so we can assert recordTurn writes exactly one row
// and computeAdvantage writes one row per reward.

import { describe, expect, it, beforeEach, jest } from "@jest/globals";

import type {
  MemoryEpisode,
  MemoryEpisodeSimilarity,
  MemoryStore,
  WriteEpisodeInput,
} from "@/lib/orchestration/memory/MemoryStore";
import { NoopTurnCritic } from "../NoopTurnCritic";
import type { TurnSnapshot } from "../types";

class FakeMemoryStore implements MemoryStore {
  public writes: WriteEpisodeInput[] = [];
  public writeImpl: (ep: WriteEpisodeInput) => Promise<string> = async () =>
    "fake-id";
  async write(ep: WriteEpisodeInput): Promise<string> {
    this.writes.push(ep);
    return this.writeImpl(ep);
  }
  async queryByTask(): Promise<MemoryEpisode[]> {
    return [];
  }
  async queryByKind(): Promise<MemoryEpisode[]> {
    return [];
  }
  async queryBySimilarity(): Promise<MemoryEpisodeSimilarity[]> {
    return [];
  }
  async close(): Promise<void> {
    // no-op
  }
}

function makeSnap(overrides: Partial<TurnSnapshot> = {}): TurnSnapshot {
  return {
    taskId: "task-1",
    issueId: "issue-1",
    node: "actor_critic_cycle",
    role: "orchestrator",
    stateHash: "abcdef0123456789",
    action: { kind: "plan", summary: "draft the thing" },
    outcome: "ok",
    rewardSignal: 0.9,
    durationMs: 42,
    modelId: "stub-model",
    timestamp: "2026-04-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("NoopTurnCritic", () => {
  let store: FakeMemoryStore;
  let critic: NoopTurnCritic;

  beforeEach(() => {
    store = new FakeMemoryStore();
    critic = new NoopTurnCritic(store);
  });

  it("recordTurn writes exactly one MemoryEpisode row", async () => {
    await critic.recordTurn(makeSnap());
    expect(store.writes).toHaveLength(1);
    const written = store.writes[0];
    expect(written.kind).toBe("entity");
    expect(written.taskId).toBe("task-1");
    expect(written.summary).toMatch(/^turn_snapshot:/);
    const content = written.content as { kind: string };
    expect(content.kind).toBe("turn_snapshot");
  });

  it("recordTurn surfaces MemoryStore errors (caller wraps in try/catch)", async () => {
    store.writeImpl = async () => {
      throw new Error("store exploded");
    };
    await expect(critic.recordTurn(makeSnap())).rejects.toThrow(
      /store exploded/,
    );
  });

  it("estimateValue returns 0", async () => {
    await expect(critic.estimateValue(makeSnap())).resolves.toBe(0);
  });

  it("computeAdvantage sets advantage = reward - 0 for each entry", async () => {
    const history: TurnSnapshot[] = [
      makeSnap({ taskId: "t1" }),
      makeSnap({ taskId: "t1" }),
      makeSnap({ taskId: "t1" }),
    ];
    const rewards = [0.2, 0.6, 0.9];
    const out = await critic.computeAdvantage(history, rewards);
    expect(out).toHaveLength(3);
    expect(out.map((a) => a.reward)).toEqual([0.2, 0.6, 0.9]);
    expect(out.map((a) => a.predictedValue)).toEqual([0, 0, 0]);
    expect(out.map((a) => a.advantage)).toEqual([0.2, 0.6, 0.9]);
    expect(out.map((a) => a.turnIndex)).toEqual([0, 1, 2]);
    for (const a of out) {
      expect(a.gamma).toBe(0.99);
      expect(a.taskId).toBe("t1");
      expect(typeof a.turnId).toBe("string");
      expect(a.turnId.length).toBeGreaterThan(0);
    }
  });

  it("computeAdvantage writes one MemoryEpisode row per advantage entry", async () => {
    const history: TurnSnapshot[] = [
      makeSnap({ taskId: "t1" }),
      makeSnap({ taskId: "t1" }),
    ];
    await critic.computeAdvantage(history, [0.3, 0.7]);
    expect(store.writes).toHaveLength(2);
    for (const w of store.writes) {
      expect(w.kind).toBe("entity");
      expect(w.summary).toMatch(/^turn_advantage:/);
      const content = w.content as { kind: string };
      expect(content.kind).toBe("turn_advantage");
    }
  });

  it("close is a no-op and safe to call", async () => {
    await expect(critic.close()).resolves.toBeUndefined();
  });

  it('name is "noop"', () => {
    expect(critic.name).toBe("noop");
  });
});

// ---------------------------------------------------------------------------
// Factory — getTurnCritic returns the same singleton across calls.
// ---------------------------------------------------------------------------

jest.mock("@/lib/orchestration/memory/PgvectorMemoryStore", () => ({
  __esModule: true,
  getPgvectorMemoryStore: () => new FakeMemoryStore(),
  PgvectorMemoryStore: class {},
}));

describe("getTurnCritic factory", () => {
  it("returns a singleton", async () => {
    // Import inside the test so the mock above binds first.
    const mod = await import("../index");
    const a = mod.getTurnCritic();
    const b = mod.getTurnCritic();
    expect(a).toBe(b);
    expect(a.name).toBe("noop");
  });
});
