// Pass 11 — Actor/Critic/Orchestrator unit tests.
//
// Uses a mock LLMProviderAdapter whose `generate()` returns pre-canned
// Actor/Critic JSON responses in strict sequence. Verifies:
//   - Happy path: Actor proposes, Critic passes with high confidence.
//   - Rework path: two REWORK then PASS, cyclesUsed=3.
//   - Exhaustion: three REWORK -> kind=exhausted.
//   - Early-stop on high confidence PASS.
//   - Type-level assertion that CriticInput.proposal cannot accept
//     `rawModelReasoning` (`@ts-expect-error` block).
//
// Excluded from the default `npm test` pass; run explicitly via
// `npx jest scripts/swarm/roles/__tests__/actor-critic.test.ts`.

import { describe, expect, it, beforeEach, afterEach } from "@jest/globals";

import {
  runActorCriticLoop,
  runActorCriticLoopForCategory,
  runSingleCycle,
} from "../orchestrator";
import type { ActorInput, ActorProposal } from "../actor";
import type { CriticInput, CriticVerdict } from "../critic";
import { DEFAULT_RUBRIC } from "@/lib/orchestration/rubrics";
import type {
  GenerationRequest,
  GenerationResponse,
  LLMProviderAdapter,
} from "../../providers";

// ---------------------------------------------------------------------------
// Mock provider: replays a queued list of JSON responses.
// ---------------------------------------------------------------------------

class ScriptedProvider implements LLMProviderAdapter {
  readonly name = "scripted";
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
    taskId: "task-xyz",
    taskInstruction: "do the needful",
    chatHistory: [],
    toolCatalog: [],
    systemPrompt: "you are the actor",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runActorCriticLoop", () => {
  let originalEnv: string | undefined;
  beforeEach(() => {
    originalEnv = process.env.GEMINI_API_KEY;
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalEnv;
  });

  it("approves on first pass when Critic PASS with high confidence", async () => {
    const provider = new ScriptedProvider([
      actorPlanJson("step one"),
      criticJson("PASS", 0.9),
    ]);
    const outcome = await runActorCriticLoop(
      baseActorInput(),
      DEFAULT_RUBRIC,
      provider,
      "stub-model",
    );
    expect(outcome.kind).toBe("approved");
    if (outcome.kind !== "approved") throw new Error("unreachable");
    expect(outcome.cyclesUsed).toBe(1);
    expect(outcome.proposal.plan).toBe("step one");
    expect(outcome.lastVerdict.verdict).toBe("PASS");
  });

  it("reworks twice then approves on the third cycle", async () => {
    const provider = new ScriptedProvider([
      actorPlanJson("attempt 1"),
      criticJson("REWORK", 0.4, "too vague"),
      actorPlanJson("attempt 2"),
      criticJson("REWORK", 0.6, "still too vague"),
      actorPlanJson("attempt 3"),
      criticJson("PASS", 0.9),
    ]);
    const outcome = await runActorCriticLoop(
      baseActorInput(),
      DEFAULT_RUBRIC,
      provider,
      "stub-model",
    );
    expect(outcome.kind).toBe("approved");
    if (outcome.kind !== "approved") throw new Error("unreachable");
    expect(outcome.cyclesUsed).toBe(3);
    expect(outcome.proposal.plan).toBe("attempt 3");
  });

  it("returns exhausted after three REWORK cycles", async () => {
    const provider = new ScriptedProvider([
      actorPlanJson("attempt 1"),
      criticJson("REWORK", 0.3, "nope 1"),
      actorPlanJson("attempt 2"),
      criticJson("REWORK", 0.5, "nope 2"),
      actorPlanJson("attempt 3"),
      criticJson("REWORK", 0.4, "nope 3"),
    ]);
    const outcome = await runActorCriticLoop(
      baseActorInput(),
      DEFAULT_RUBRIC,
      provider,
      "stub-model",
    );
    expect(outcome.kind).toBe("exhausted");
    if (outcome.kind !== "exhausted") throw new Error("unreachable");
    expect(outcome.cyclesUsed).toBe(3);
    // Best (highest-confidence) proposal survives; 0.5 > 0.3,0.4 so attempt 2.
    expect(outcome.lastProposal.plan).toBe("attempt 2");
  });

  it("early-stops when PASS confidence meets minConfidenceForPass", async () => {
    const provider = new ScriptedProvider([
      actorPlanJson("early-stop plan"),
      criticJson("PASS", 0.85),
      // Extra entries that must NOT be consumed.
      actorPlanJson("SHOULD NOT BE CALLED"),
      criticJson("PASS", 1.0),
    ]);
    const outcome = await runActorCriticLoop(
      baseActorInput(),
      DEFAULT_RUBRIC,
      provider,
      "stub-model",
      { minConfidenceForPass: 0.85 },
    );
    expect(outcome.kind).toBe("approved");
    if (outcome.kind !== "approved") throw new Error("unreachable");
    expect(outcome.cyclesUsed).toBe(1);
    expect(provider.calls.length).toBe(2);
  });

  it("feeds critique back to the Actor on rework", async () => {
    const provider = new ScriptedProvider([
      actorPlanJson("v1"),
      criticJson("REWORK", 0.3, "please cite files"),
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
    // Third provider call is the second Actor invocation; its userPrompt
    // should embed the critique.
    const secondActorPrompt = provider.calls[2].userPrompt;
    expect(secondActorPrompt).toContain("please cite files");
  });
});

// Pass 12 — exhaustion path explicitly named. Duplicates the
// "returns exhausted after three REWORK cycles" assertion above with the
// category-aware entry point `runActorCriticLoopForCategory`, so the
// registry fallback is exercised end-to-end.
describe("runActorCriticLoop exhaustion (pass 12)", () => {
  it("three REWORK proposals in a row → cyclesUsed=3, kind=exhausted (via category loader)", async () => {
    const provider = new ScriptedProvider([
      actorPlanJson("attempt 1"),
      criticJson("REWORK", 0.2, "v1 too vague"),
      actorPlanJson("attempt 2"),
      criticJson("REWORK", 0.2, "v2 still too vague"),
      actorPlanJson("attempt 3"),
      criticJson("REWORK", 0.2, "v3 also rejected"),
    ]);
    const outcome = await runActorCriticLoopForCategory(
      baseActorInput(),
      "unknown_category_falls_through",
      provider,
      "stub-model",
    );
    expect(outcome.kind).toBe("exhausted");
    if (outcome.kind !== "exhausted") throw new Error("unreachable");
    expect(outcome.cyclesUsed).toBe(3);
    expect(outcome.lastVerdict.verdict).toBe("REWORK");
  });

  it('loads the QA rubric when category="1_qa"', async () => {
    const provider = new ScriptedProvider([
      actorPlanJson("draft plan"),
      criticJson("PASS", 0.95),
    ]);
    const outcome = await runActorCriticLoopForCategory(
      baseActorInput(),
      "1_qa",
      provider,
      "stub-model",
    );
    expect(outcome.kind).toBe("approved");
    // The Critic prompt should cite the `1_qa` rubric name.
    const criticPrompt = provider.calls[1].userPrompt;
    expect(criticPrompt).toContain("Rubric: 1_qa");
  });
});

describe("runSingleCycle", () => {
  it("strips rawModelReasoning before calling the Critic", async () => {
    const provider = new ScriptedProvider([
      JSON.stringify({
        kind: "plan",
        plan: "with reasoning",
        rawModelReasoning: "SECRET internal monologue",
      }),
      criticJson("PASS", 0.9),
    ]);
    const { verdict } = await runSingleCycle(
      baseActorInput(),
      DEFAULT_RUBRIC,
      provider,
      "stub-model",
    );
    expect(verdict.verdict).toBe("PASS");
    const criticPrompt = provider.calls[1].userPrompt;
    expect(criticPrompt).not.toContain("SECRET internal monologue");
    expect(criticPrompt).toContain("with reasoning");
  });
});

// ---------------------------------------------------------------------------
// Type-level assertion: CriticInput.proposal must NOT accept
// `rawModelReasoning`. This block does not run at runtime — it is a
// compile-time check that TypeScript will error on if the boundary slips.
// ---------------------------------------------------------------------------

describe("CriticInput type boundary", () => {
  it("rejects rawModelReasoning at compile time (object-literal excess check)", () => {
    // Object-literal excess-property check: if `rawModelReasoning` ever
    // becomes assignable to `CriticInput.proposal`, the `@ts-expect-error`
    // below will start emitting "Unused '@ts-expect-error' directive" and
    // tsc will fail. That is the guardrail.
    const good: CriticInput = {
      taskId: "t",
      taskInstruction: "i",
      proposal: {
        kind: "plan",
        plan: "a plan",
        // @ts-expect-error rawModelReasoning is not allowed on CriticInput.proposal
        rawModelReasoning: "hidden",
      },
      rubric: DEFAULT_RUBRIC,
    };
    expect(good.taskId).toBe("t");
  });
});
