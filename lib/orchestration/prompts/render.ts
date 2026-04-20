// Pass 13 — Central prompt renderer.
//
// Single entry point for Actor and Critic prompt construction. Pass 11 put a
// type-level boundary on `CriticInput.proposal` via `Pick<>`. Pass 13 adds:
//   1. A single module that BOTH roles route through (so any caller that
//      tries to leak Actor reasoning into Critic context must either import
//      this module and get type-checked, or bypass it entirely — which is
//      grep-detectable).
//   2. A runtime guard that rejects banned keys (`rawModelReasoning`,
//      `chatHistory`, `systemPrompt`) on the `CriticInput` shape, even if a
//      caller casts through `any`.
//
// Branded return types (`ActorPrompt`, `CriticPrompt`) prevent accidental
// structural assignment of one prompt where the other is expected.
//
// Note on types: this module re-declares `StrictActorInput` /
// `StrictCriticInput` rather than importing from `scripts/swarm/roles/*`.
// `lib/` must not depend on `scripts/`. The shapes are kept identical to
// the role-side types; structural compatibility lets values flow in either
// direction without a cast.

import type { Rubric } from "@/lib/orchestration/rubrics/types";

// --- Input shapes ----------------------------------------------------------

export interface StrictActorInput {
  taskId: string;
  taskInstruction: string;
  chatHistory: Array<{ role: string; content: string }>;
  toolCatalog: ReadonlyArray<{
    name: string;
    description: string;
    schema?: unknown;
  }>;
  systemPrompt: string;
  critique?: string;
  /** Pass 14 — terse summary of the read-only exploration phase that
   *  preceded this Actor turn. Rendered under "Prior exploration findings".
   *  Actor-only: never appears in `StrictCriticInput`. */
  explorationNotes?: string;
}

export interface StrictCriticProposal {
  kind: "plan" | "tool_call" | "final_message";
  plan?: string;
  toolCall?: { name: string; args: unknown };
  finalMessage?: string;
}

export interface StrictCriticInput {
  taskId: string;
  taskInstruction: string;
  proposal: StrictCriticProposal;
  rubric: Rubric;
}

// --- Branded prompt types --------------------------------------------------

export type ActorPrompt = string & { readonly __brand: "ActorPrompt" };
export type CriticPrompt = string & { readonly __brand: "CriticPrompt" };

// --- Runtime guard ---------------------------------------------------------

/** Keys that MUST NEVER appear on a `CriticInput` (top-level or inside
 *  `proposal`). These are the Actor-side context surfaces that would leak
 *  reasoning or chat history into the Critic prompt. */
export const CRITIC_BANNED_KEYS: ReadonlySet<string> = new Set([
  "rawModelReasoning",
  "chatHistory",
  "systemPrompt",
]);

function assertNoBannedKeys(obj: Record<string, unknown>, where: string): void {
  for (const key of Object.keys(obj)) {
    if (CRITIC_BANNED_KEYS.has(key)) {
      throw new Error(
        `renderCriticPrompt: banned key "${key}" present in ${where} — context leak`,
      );
    }
  }
}

// --- Renderers -------------------------------------------------------------

/** Render the Actor prompt. Includes system prompt, task instruction, chat
 *  history, tool catalog, and (if present) the Critic's last critique for
 *  rework. Returns a branded `ActorPrompt` to prevent accidental misuse. */
export function renderActorPrompt(input: StrictActorInput): ActorPrompt {
  const lines: string[] = [];
  lines.push(input.systemPrompt);
  lines.push("");
  lines.push(`Task: ${input.taskId}`);
  lines.push(`Instruction:\n${input.taskInstruction}`);
  lines.push("");
  if (input.chatHistory.length > 0) {
    lines.push("Chat history:");
    for (const m of input.chatHistory) {
      lines.push(`[${m.role}] ${m.content}`);
    }
    lines.push("");
  }
  lines.push(`Tool catalog (${input.toolCatalog.length} tools available).`);
  for (const t of input.toolCatalog) {
    lines.push(`- ${t.name}: ${t.description}`);
  }
  if (input.critique !== undefined && input.critique.length > 0) {
    lines.push("");
    lines.push("A prior proposal was rejected with the following critique:");
    lines.push(input.critique);
    lines.push("Revise accordingly.");
  }
  if (
    input.explorationNotes !== undefined &&
    input.explorationNotes.length > 0
  ) {
    lines.push("");
    lines.push("Prior exploration findings:");
    lines.push(input.explorationNotes);
  }
  lines.push("");
  lines.push(
    "Respond with exactly one JSON object shaped " +
      '{ "kind": "plan" | "tool_call" | "final_message", "plan"?: string, ' +
      '"toolCall"?: { "name": string, "args": object }, "finalMessage"?: ' +
      'string, "rawModelReasoning"?: string }.',
  );
  return lines.join("\n") as ActorPrompt;
}

/** Render the Critic prompt. ONLY consumes `proposal` (Pick-based, no
 *  reasoning) + `rubric` + task identifiers. Throws at runtime if any banned
 *  key is present on the input or inside the proposal — this catches
 *  bypasses that cast through `any`. */
export function renderCriticPrompt(input: StrictCriticInput): CriticPrompt {
  assertNoBannedKeys(
    input as unknown as Record<string, unknown>,
    "CriticInput",
  );
  const proposal = input.proposal as unknown as
    | Record<string, unknown>
    | null
    | undefined;
  if (proposal !== null && proposal !== undefined) {
    assertNoBannedKeys(proposal, "CriticInput.proposal");
  }

  const parts: string[] = [];
  parts.push(`Task ID: ${input.taskId}`);
  parts.push(`Task: ${input.taskInstruction}`);
  parts.push(`Rubric: ${input.rubric.name} — ${input.rubric.description}`);
  parts.push(
    `Checks:\n${input.rubric.checks
      .map((c) => `  - ${c.id}: ${c.description}`)
      .join("\n")}`,
  );
  parts.push(`Proposal:\n${JSON.stringify(input.proposal, null, 2)}`);
  parts.push(
    'Output a JSON verdict with fields: verdict ("PASS"|"REWORK"), ' +
      "confidence (0..1), critique (string, if REWORK), findings (array " +
      "of {checkId, passed, note?}).",
  );
  return parts.join("\n\n") as CriticPrompt;
}
