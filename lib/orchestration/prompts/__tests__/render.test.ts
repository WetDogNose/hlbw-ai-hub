// Pass 13 — unit tests for the central prompt renderer.
//
// Covers:
//   - Actor prompt rendering (no critique, with critique).
//   - Critic prompt rendering (valid input).
//   - Runtime banned-key rejection at top level of CriticInput.
//   - Runtime banned-key rejection inside the proposal.
//   - Extra `rawModelReasoning` on the top-level input is caught by the
//     runtime guard even when the caller casts through `any`.
//   - Branded ActorPrompt / CriticPrompt return types compile.

import { describe, expect, it } from "@jest/globals";

import {
  renderActorPrompt,
  renderCriticPrompt,
  type ActorPrompt,
  type CriticPrompt,
  type StrictActorInput,
  type StrictCriticInput,
} from "../render";
import { DEFAULT_RUBRIC } from "@/lib/orchestration/rubrics";

const baseActorInput: StrictActorInput = {
  taskId: "task-123",
  taskInstruction: "ship the feature",
  chatHistory: [
    { role: "user", content: "please help" },
    { role: "assistant", content: "on it" },
  ],
  toolCatalog: [
    { name: "grep", description: "search content" },
    { name: "read", description: "read a file" },
  ],
  systemPrompt: "you are the actor",
};

const baseCriticInput: StrictCriticInput = {
  taskId: "task-123",
  taskInstruction: "ship the feature",
  proposal: { kind: "plan", plan: "do X then Y" },
  rubric: DEFAULT_RUBRIC,
};

describe("renderActorPrompt", () => {
  it("includes taskInstruction and chat history when no critique present", () => {
    const prompt = renderActorPrompt(baseActorInput);
    expect(prompt).toContain("ship the feature");
    expect(prompt).toContain("[user] please help");
    expect(prompt).toContain("[assistant] on it");
    expect(prompt).toContain("grep: search content");
    expect(prompt).not.toContain("A prior proposal was rejected");
  });

  it("includes critique text when present", () => {
    const prompt = renderActorPrompt({
      ...baseActorInput,
      critique: "your plan did not cite any file paths",
    });
    expect(prompt).toContain("your plan did not cite any file paths");
    expect(prompt).toContain("A prior proposal was rejected");
  });

  it("returns a string assignable to ActorPrompt brand", () => {
    const prompt: ActorPrompt = renderActorPrompt(baseActorInput);
    // The brand is a compile-time marker. At runtime it is a plain string.
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });
});

describe("renderCriticPrompt", () => {
  it("includes rubric name and each check id when input is valid", () => {
    const prompt = renderCriticPrompt(baseCriticInput);
    expect(prompt).toContain(`Rubric: ${DEFAULT_RUBRIC.name}`);
    for (const check of DEFAULT_RUBRIC.checks) {
      expect(prompt).toContain(check.id);
    }
    expect(prompt).toContain(baseCriticInput.taskInstruction);
    expect(prompt).toContain('"kind": "plan"');
  });

  it("returns a string assignable to CriticPrompt brand", () => {
    const prompt: CriticPrompt = renderCriticPrompt(baseCriticInput);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('throws when banned key "rawModelReasoning" appears at top level of CriticInput', () => {
    // Cast through a two-step unknown cast — same bypass a malicious caller
    // would use. The runtime guard must catch it.
    const leaky = {
      ...baseCriticInput,
      rawModelReasoning: "LEAKED internal monologue",
    } as unknown as StrictCriticInput;
    expect(() => renderCriticPrompt(leaky)).toThrow(
      /banned key "rawModelReasoning"/,
    );
  });

  it('throws when banned key "chatHistory" appears at top level', () => {
    const leaky = {
      ...baseCriticInput,
      chatHistory: [{ role: "assistant", content: "leaked" }],
    } as unknown as StrictCriticInput;
    expect(() => renderCriticPrompt(leaky)).toThrow(/banned key "chatHistory"/);
  });

  it('throws when banned key "systemPrompt" appears at top level', () => {
    const leaky = {
      ...baseCriticInput,
      systemPrompt: "leaked system prompt",
    } as unknown as StrictCriticInput;
    expect(() => renderCriticPrompt(leaky)).toThrow(
      /banned key "systemPrompt"/,
    );
  });

  it("throws when a banned key appears inside proposal", () => {
    const leaky = {
      ...baseCriticInput,
      proposal: {
        kind: "plan" as const,
        plan: "some plan",
        rawModelReasoning: "SECRET reasoning",
      },
    } as unknown as StrictCriticInput;
    expect(() => renderCriticPrompt(leaky)).toThrow(
      /banned key "rawModelReasoning" present in CriticInput\.proposal/,
    );
  });

  it("catches runtime leak even if a caller casts a StrictActorInput shape to any", () => {
    // Simulates: a buggy caller builds an Actor-shaped input (with
    // rawModelReasoning) then passes it to renderCriticPrompt via `any`.
    const actorShapedWithReasoning = {
      taskId: "task-123",
      taskInstruction: "ship it",
      chatHistory: [],
      toolCatalog: [],
      systemPrompt: "actor prompt",
      rawModelReasoning: "this should not leak",
      proposal: { kind: "plan" as const, plan: "p" },
      rubric: DEFAULT_RUBRIC,
    };
    expect(() =>
      renderCriticPrompt(
        actorShapedWithReasoning as unknown as StrictCriticInput,
      ),
    ).toThrow(/banned key/);
  });
});
