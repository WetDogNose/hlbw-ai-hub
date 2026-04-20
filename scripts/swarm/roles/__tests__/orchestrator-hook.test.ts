// Pass 19 — Orchestrator TurnCritic hook tests.
//
// Mocks `@/lib/rl` to capture `recordTurn` / `computeAdvantage` calls and
// asserts:
//   1. `recordTurn` is called once per Actor/Critic cycle.
//   2. A broken `recordTurn` (throws) does NOT surface — the loop still
//      returns correctly.
//   3. `computeAdvantage` is called fire-and-forget at loop end with
//      `rewards[i] === verdict.confidence` for each cycle.
//
// The mock is registered BEFORE importing `runActorCriticLoop` so the
// factory the orchestrator binds against is the mock.

import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";

import type { TurnCritic, TurnSnapshot } from "@/lib/rl";

// Capture buffers shared between the mock factory and the test assertions.
interface CapturedComputeCall {
  history: TurnSnapshot[];
  rewards: number[];
}

const recordTurnCalls: TurnSnapshot[] = [];
const computeAdvantageCalls: CapturedComputeCall[] = [];
let recordTurnShouldThrow = false;

const fakeCritic: TurnCritic = {
  name: "test-fake",
  async recordTurn(snap) {
    recordTurnCalls.push(snap);
    if (recordTurnShouldThrow) {
      throw new Error("turn critic is broken");
    }
  },
  async estimateValue() {
    return 0;
  },
  async computeAdvantage(history, rewards) {
    computeAdvantageCalls.push({
      history: [...history],
      rewards: [...rewards],
    });
    return rewards.map((r, i) => ({
      turnId: `t_${i}`,
      taskId: history[i]?.taskId ?? "unknown",
      turnIndex: i,
      reward: r,
      predictedValue: 0,
      advantage: r,
      gamma: 0.99,
      computedAt: new Date().toISOString(),
    }));
  },
};

jest.mock("@/lib/rl", () => {
  const actual = jest.requireActual<typeof import("@/lib/rl")>("@/lib/rl");
  return {
    __esModule: true,
    ...actual,
    getTurnCritic: () => fakeCritic,
  };
});

import { runActorCriticLoop } from "../orchestrator";
import type { ActorInput, ActorProposal } from "../actor";
import type { CriticVerdict } from "../critic";
import { DEFAULT_RUBRIC } from "@/lib/orchestration/rubrics";
import type {
  GenerationRequest,
  GenerationResponse,
  LLMProviderAdapter,
} from "../../providers";

class ScriptedProvider implements LLMProviderAdapter {
  readonly name = "scripted-hook";
  private readonly queue: string[];
  public calls: GenerationRequest[] = [];
  constructor(queue: string[]) {
    this.queue = [...queue];
  }
  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    this.calls.push(request);
    const text = this.queue.shift();
    if (text === undefined) {
      throw new Error("ScriptedProvider: queue exhausted");
    }
    return {
      text,
      provider: this.name,
      modelId: request.modelId,
      finishReason: "stop",
    };
  }
  async healthcheck(): Promise<boolean> {
    return true;
  }
}

function actorPlanJson(plan: string): string {
  return JSON.stringify({
    kind: "plan",
    plan,
  } satisfies Partial<ActorProposal>);
}

function criticJson(
  verdict: "PASS" | "REWORK",
  confidence: number,
  critique?: string,
): string {
  const obj: Partial<CriticVerdict> = {
    verdict,
    confidence,
    findings: [{ checkId: "progress", passed: verdict === "PASS" }],
  };
  if (critique !== undefined) obj.critique = critique;
  return JSON.stringify(obj);
}

function baseActorInput(overrides: Partial<ActorInput> = {}): ActorInput {
  return {
    taskId: "task-hook-1",
    taskInstruction: "do the needful",
    chatHistory: [],
    toolCatalog: [],
    systemPrompt: "you are the actor",
    ...overrides,
  };
}

async function flushMicrotasks(): Promise<void> {
  // The orchestrator fires computeAdvantage with `void (async () => ...)`.
  // Give the microtask queue a chance to run before the assertion.
  await new Promise((resolve) => setImmediate(resolve));
}

describe("Orchestrator Turn-PPO hook", () => {
  beforeEach(() => {
    recordTurnCalls.length = 0;
    computeAdvantageCalls.length = 0;
    recordTurnShouldThrow = false;
  });
  afterEach(() => {
    recordTurnCalls.length = 0;
    computeAdvantageCalls.length = 0;
    recordTurnShouldThrow = false;
  });

  it("calls recordTurn exactly once per Actor/Critic cycle (1-cycle PASS)", async () => {
    const provider = new ScriptedProvider([
      actorPlanJson("one-shot plan"),
      criticJson("PASS", 0.95),
    ]);
    const outcome = await runActorCriticLoop(
      baseActorInput(),
      DEFAULT_RUBRIC,
      provider,
      "stub-model",
    );
    expect(outcome.kind).toBe("approved");
    expect(recordTurnCalls).toHaveLength(1);
    const snap = recordTurnCalls[0];
    expect(snap.taskId).toBe("task-hook-1");
    expect(snap.role).toBe("orchestrator");
    expect(snap.action.kind).toBe("plan");
    expect(snap.rewardSignal).toBe(0.95);
    expect(snap.modelId).toBe("stub-model");
    expect(snap.stateHash).toHaveLength(16);
  });

  it("calls recordTurn once per cycle across rework cycles", async () => {
    const provider = new ScriptedProvider([
      actorPlanJson("v1"),
      criticJson("REWORK", 0.3, "try again"),
      actorPlanJson("v2"),
      criticJson("REWORK", 0.5, "closer"),
      actorPlanJson("v3"),
      criticJson("PASS", 0.9),
    ]);
    const outcome = await runActorCriticLoop(
      baseActorInput(),
      DEFAULT_RUBRIC,
      provider,
      "stub-model",
    );
    expect(outcome.kind).toBe("approved");
    expect(recordTurnCalls).toHaveLength(3);
    expect(recordTurnCalls.map((s) => s.rewardSignal)).toEqual([0.3, 0.5, 0.9]);
  });

  it("does not break orchestration when recordTurn throws", async () => {
    recordTurnShouldThrow = true;
    const provider = new ScriptedProvider([
      actorPlanJson("plan"),
      criticJson("PASS", 0.95),
    ]);
    const outcome = await runActorCriticLoop(
      baseActorInput(),
      DEFAULT_RUBRIC,
      provider,
      "stub-model",
    );
    // The loop still returns an approved outcome; the exception was
    // swallowed inside the RL:recordTurn span.
    expect(outcome.kind).toBe("approved");
  });

  it("calls computeAdvantage fire-and-forget on the approved path", async () => {
    const provider = new ScriptedProvider([
      actorPlanJson("v1"),
      criticJson("REWORK", 0.4, "try harder"),
      actorPlanJson("v2"),
      criticJson("PASS", 0.9),
    ]);
    const outcome = await runActorCriticLoop(
      baseActorInput(),
      DEFAULT_RUBRIC,
      provider,
      "stub-model",
    );
    expect(outcome.kind).toBe("approved");
    await flushMicrotasks();
    expect(computeAdvantageCalls).toHaveLength(1);
    const { history, rewards } = computeAdvantageCalls[0];
    expect(rewards).toEqual([0.4, 0.9]);
    expect(history).toHaveLength(2);
    for (const s of history) {
      expect(s.taskId).toBe("task-hook-1");
    }
  });

  it("calls computeAdvantage fire-and-forget on the exhausted path", async () => {
    const provider = new ScriptedProvider([
      actorPlanJson("v1"),
      criticJson("REWORK", 0.2, "nope"),
      actorPlanJson("v2"),
      criticJson("REWORK", 0.3, "still nope"),
      actorPlanJson("v3"),
      criticJson("REWORK", 0.4, "still no"),
    ]);
    const outcome = await runActorCriticLoop(
      baseActorInput(),
      DEFAULT_RUBRIC,
      provider,
      "stub-model",
    );
    expect(outcome.kind).toBe("exhausted");
    await flushMicrotasks();
    expect(computeAdvantageCalls).toHaveLength(1);
    expect(computeAdvantageCalls[0].rewards).toEqual([0.2, 0.3, 0.4]);
  });
});
