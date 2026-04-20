// Pass 11 — Actor role.
// Pass 13 — prompt construction centralised in
// `lib/orchestration/prompts/render.ts` so every role boundary goes through
// one enforceable module (type-level + runtime).
//
// Proposes a plan, a tool call, or a final message. Never self-evaluates.
// The Critic (see ./critic.ts) scores the proposal; the Orchestrator (see
// ./orchestrator.ts) routes between them.

import type { LLMProviderAdapter } from "../providers";
import { renderActorPrompt as renderActorPromptImpl } from "@/lib/orchestration/prompts/render";
import type {
  ActorPrompt,
  StrictActorInput,
} from "@/lib/orchestration/prompts/render";
import { getOrchestratorTracer } from "@/lib/orchestration/tracing/tracer";
import { SPAN_ATTR, SPAN_ROLE } from "@/lib/orchestration/tracing/attrs";

export interface ActorChatMessage {
  role: string;
  content: string;
}

export interface ActorInput {
  taskId: string;
  taskInstruction: string;
  chatHistory: ActorChatMessage[];
  /** Tool catalogue filtered by agentCategory (pass 15's context builder
   *  refines the selection). */
  toolCatalog: unknown[];
  systemPrompt: string;
  /** Present only on rework — the Critic's last findings. */
  critique?: string;
  /** Pass 14 — human-readable summary of the read-only exploration phase
   *  that ran before this prompt. Populated by the `explore` node and
   *  surfaced by `renderActorPrompt` under a "Prior exploration findings"
   *  section. Absent on rework / first-turn-no-budget paths. */
  explorationNotes?: string;
}

export type ActorProposalKind = "plan" | "tool_call" | "final_message";

export interface ActorToolCall {
  name: string;
  args: unknown;
}

export interface ActorProposal {
  kind: ActorProposalKind;
  /** Populated when `kind === "plan"`. */
  plan?: string;
  /** Populated when `kind === "tool_call"`. */
  toolCall?: ActorToolCall;
  /** Populated when `kind === "final_message"`. */
  finalMessage?: string;
  /** Kept internal; NEVER passed to Critic. Pass 13 enforces this at the
   *  type level — `CriticInput.proposal` picks only the non-reasoning
   *  fields. */
  rawModelReasoning?: string;
}

/** Render the Actor prompt. Delegates to the central renderer in
 *  `lib/orchestration/prompts/render.ts`. Critic rubric text is never
 *  included. The `ActorInput` shape below is structurally compatible with
 *  `StrictActorInput`; the cast narrows the `toolCatalog: unknown[]` field
 *  (the role keeps a looser shape for back-compat; pass 15 will tighten it).
 */
export function renderActorPrompt(input: ActorInput): ActorPrompt {
  const strict: StrictActorInput = {
    taskId: input.taskId,
    taskInstruction: input.taskInstruction,
    chatHistory: input.chatHistory,
    toolCatalog: input.toolCatalog as ReadonlyArray<{
      name: string;
      description: string;
      schema?: unknown;
    }>,
    systemPrompt: input.systemPrompt,
    ...(input.critique !== undefined ? { critique: input.critique } : {}),
    ...(input.explorationNotes !== undefined
      ? { explorationNotes: input.explorationNotes }
      : {}),
  };
  return renderActorPromptImpl(strict);
}

function parseProposal(text: string): ActorProposal {
  // Extract the first JSON object in the response, defensive against
  // leading prose or markdown fencing.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    // Fallback: treat the entire response as a final_message. This keeps
    // the orchestrator moving when a provider ignores the JSON instruction.
    return { kind: "final_message", finalMessage: text };
  }
  if (typeof parsed !== "object" || parsed === null || !("kind" in parsed)) {
    return { kind: "final_message", finalMessage: text };
  }
  const obj = parsed as Record<string, unknown>;
  const kind = obj.kind as ActorProposalKind;
  if (kind !== "plan" && kind !== "tool_call" && kind !== "final_message") {
    return { kind: "final_message", finalMessage: text };
  }
  const proposal: ActorProposal = { kind };
  if (typeof obj.plan === "string") proposal.plan = obj.plan;
  if (typeof obj.finalMessage === "string") {
    proposal.finalMessage = obj.finalMessage;
  }
  if (typeof obj.rawModelReasoning === "string") {
    proposal.rawModelReasoning = obj.rawModelReasoning;
  }
  if (
    obj.toolCall !== null &&
    typeof obj.toolCall === "object" &&
    obj.toolCall !== undefined &&
    typeof (obj.toolCall as { name?: unknown }).name === "string"
  ) {
    const tc = obj.toolCall as { name: string; args?: unknown };
    proposal.toolCall = { name: tc.name, args: tc.args ?? {} };
  }
  return proposal;
}

/**
 * Ask the LLM to produce a single proposal. The caller (typically the
 * Orchestrator's reflection loop) decides what to do with the result.
 *
 * Pass 18 — wraps the Actor's provider call in an `Actor:propose` span
 * tagged with `(role=actor, taskId, modelId, cycle)`. The span ends in
 * both success and error paths via `finally`. Cycle defaults to 1 when
 * the caller does not pass an explicit cycle; the orchestrator loop
 * updates the cycle counter through `opts.cycle`.
 */
export async function propose(
  input: ActorInput,
  provider: LLMProviderAdapter,
  modelId: string,
  opts: { cycle?: number } = {},
): Promise<ActorProposal> {
  const tracer = getOrchestratorTracer();
  return tracer.startActiveSpan("Actor:propose", async (span) => {
    span.setAttribute(SPAN_ATTR.ROLE, SPAN_ROLE.ACTOR);
    span.setAttribute(SPAN_ATTR.TASK_ID, input.taskId);
    span.setAttribute(SPAN_ATTR.MODEL_ID, modelId);
    span.setAttribute(SPAN_ATTR.CYCLE, opts.cycle ?? 1);
    try {
      const userPrompt = renderActorPrompt(input);
      const response = await provider.generate({
        systemPrompt: input.systemPrompt,
        userPrompt,
        modelId,
        metadata: { role: "actor", taskId: input.taskId },
      });
      return parseProposal(response.text);
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
