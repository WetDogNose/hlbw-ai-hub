// Pass 13 — context-isolation enforcement.
//
// Three gates:
//   1. Grep the orchestrator source for `...proposal` spreads and
//      `Object.assign(criticInput, proposal)` — either pattern is a direct
//      leak of Actor reasoning into the Critic prompt.
//   2. Exercise the runtime guard in `lib/orchestration/prompts/render.ts`
//      by passing banned keys via `any`.
//   3. Drive the full `runActorCriticLoop` with a scripted provider whose
//      Actor response contains `rawModelReasoning`. Assert the Critic's
//      received prompt never contains that secret string.

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "@jest/globals";

import { renderCriticPrompt } from "@/lib/orchestration/prompts/render";
import type { StrictCriticInput } from "@/lib/orchestration/prompts/render";
import { DEFAULT_RUBRIC } from "@/lib/orchestration/rubrics";
import { runActorCriticLoop } from "../orchestrator";
import type { ActorInput } from "../actor";
import type {
  GenerationRequest,
  GenerationResponse,
  LLMProviderAdapter,
} from "../../providers";

// ---------------------------------------------------------------------------
// 1. Grep-based source check on the orchestrator.
// ---------------------------------------------------------------------------

describe("orchestrator source discipline", () => {
  const orchestratorPath = path.resolve(__dirname, "..", "orchestrator.ts");

  it("never spreads ActorProposal into CriticInput (`...proposal`)", () => {
    const src = fs.readFileSync(orchestratorPath, "utf8");
    // Strip comments so the rule-enforcement notes in the file don't
    // false-positive against themselves.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(stripped).not.toMatch(/\.{3}proposal\b/);
    expect(stripped).not.toMatch(/Object\.assign\([^,]*,\s*proposal/);
  });
});

// ---------------------------------------------------------------------------
// 2. Runtime guard: banned key via `any` bypass.
// ---------------------------------------------------------------------------

describe("renderCriticPrompt runtime guard", () => {
  const baseCriticInput: StrictCriticInput = {
    taskId: "task-999",
    taskInstruction: "unit test the guard",
    proposal: { kind: "plan", plan: "p" },
    rubric: DEFAULT_RUBRIC,
  };

  it("throws when a banned key is present at the top level", () => {
    const leaky = {
      ...baseCriticInput,
      rawModelReasoning: "SECRET",
    };
    expect(() =>
      renderCriticPrompt(leaky as unknown as StrictCriticInput),
    ).toThrow(/banned key "rawModelReasoning"/);
  });

  it("throws when an Actor-shaped input is mis-passed via any", () => {
    const actorShaped = {
      taskId: "t",
      taskInstruction: "i",
      chatHistory: [],
      toolCatalog: [],
      systemPrompt: "actor system prompt",
      proposal: { kind: "plan" as const, plan: "p" },
      rubric: DEFAULT_RUBRIC,
    };
    expect(() =>
      renderCriticPrompt(actorShaped as unknown as StrictCriticInput),
    ).toThrow(/banned key/);
  });
});

// ---------------------------------------------------------------------------
// 3. End-to-end: Actor proposes with rawModelReasoning; Critic prompt
//    must not contain it.
// ---------------------------------------------------------------------------

class CapturingProvider implements LLMProviderAdapter {
  readonly name = "capturing";
  public calls: GenerationRequest[] = [];
  public lastPrompt: string | undefined;
  private readonly queue: string[];
  constructor(queue: string[]) {
    this.queue = [...queue];
  }
  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    this.calls.push(request);
    this.lastPrompt = request.userPrompt;
    const text = this.queue.shift();
    if (text === undefined) throw new Error("queue exhausted");
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

describe("runActorCriticLoop context isolation", () => {
  it("Critic prompt never contains the Actor's rawModelReasoning", async () => {
    const secret = "SECRET_actor_internal_monologue_XYZ";
    const actorPlan = {
      kind: "plan",
      plan: "call grep on foo.ts",
      rawModelReasoning: secret,
    };
    const criticVerdict = {
      verdict: "PASS",
      confidence: 0.95,
      findings: [{ checkId: "progress", passed: true }],
    };
    const provider = new CapturingProvider([
      JSON.stringify(actorPlan),
      JSON.stringify(criticVerdict),
    ]);
    const input: ActorInput = {
      taskId: "iso-1",
      taskInstruction: "enforce isolation",
      chatHistory: [],
      toolCatalog: [],
      systemPrompt: "you are the actor",
    };
    const outcome = await runActorCriticLoop(
      input,
      DEFAULT_RUBRIC,
      provider,
      "stub-model",
    );
    expect(outcome.kind).toBe("approved");
    // The second call is the Critic. Its captured prompt must not contain
    // the secret string from the Actor's internal reasoning.
    expect(provider.calls.length).toBe(2);
    const criticPrompt = provider.calls[1].userPrompt;
    expect(criticPrompt).not.toContain(secret);
    expect(criticPrompt).not.toContain("rawModelReasoning");
    // Sanity: the plan DOES reach the Critic (the non-reasoning payload).
    expect(criticPrompt).toContain("call grep on foo.ts");
  });
});
