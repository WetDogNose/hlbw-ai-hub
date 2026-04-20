// Pass 11 — Critic role.
// Pass 13 — prompt construction centralised in
// `lib/orchestration/prompts/render.ts`. The renderer enforces the
// context-isolation contract at runtime (banned keys: `rawModelReasoning`,
// `chatHistory`, `systemPrompt`) in addition to the type-level `Pick<>`
// boundary below.
//
// Scores an Actor proposal against a rubric and returns PASS/REWORK +
// critique. The Critic is intentionally context-isolated from the Actor's
// reasoning: its input type uses `Pick<ActorProposal, ...>` to exclude
// `rawModelReasoning`, so passing the Actor's internal reasoning is a
// compile error.

import type { LLMProviderAdapter } from "../providers";
import type { ActorProposal } from "./actor";
import { renderCriticPrompt as renderCriticPromptImpl } from "@/lib/orchestration/prompts/render";
import type {
  CriticPrompt,
  StrictCriticInput,
} from "@/lib/orchestration/prompts/render";
import { getOrchestratorTracer } from "@/lib/orchestration/tracing/tracer";
import { SPAN_ATTR, SPAN_ROLE } from "@/lib/orchestration/tracing/attrs";

export interface RubricCheck {
  id: string;
  description: string;
}

export interface Rubric {
  name: string;
  description: string;
  checks: RubricCheck[];
}

export interface CriticInput {
  taskId: string;
  taskInstruction: string;
  /**
   * The Actor's proposal with `rawModelReasoning` stripped. Using Pick here
   * is load-bearing: the TypeScript compiler rejects any attempt to pass a
   * full `ActorProposal` that still carries `rawModelReasoning`. Pass 13
   * extends this discipline to every role boundary.
   */
  proposal: Pick<ActorProposal, "kind" | "plan" | "toolCall" | "finalMessage">;
  rubric: Rubric;
}

export interface CriticFinding {
  checkId: string;
  passed: boolean;
  note?: string;
}

export interface CriticVerdict {
  verdict: "PASS" | "REWORK";
  confidence: number; // 0..1
  /** Present when `verdict === "REWORK"`. */
  critique?: string;
  findings: CriticFinding[];
}

/** Render the Critic prompt via the central renderer. Values flow in
 *  structurally — `CriticInput["proposal"]` is `Pick`-based and identical
 *  in shape to `StrictCriticProposal`. */
export function renderCriticPrompt(input: CriticInput): CriticPrompt {
  const strict: StrictCriticInput = {
    taskId: input.taskId,
    taskInstruction: input.taskInstruction,
    proposal: {
      kind: input.proposal.kind,
      ...(input.proposal.plan !== undefined
        ? { plan: input.proposal.plan }
        : {}),
      ...(input.proposal.toolCall !== undefined
        ? { toolCall: input.proposal.toolCall }
        : {}),
      ...(input.proposal.finalMessage !== undefined
        ? { finalMessage: input.proposal.finalMessage }
        : {}),
    },
    rubric: input.rubric,
  };
  return renderCriticPromptImpl(strict);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function parseVerdict(text: string, rubric: Rubric): CriticVerdict {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return {
      verdict: "REWORK",
      confidence: 0,
      critique: `Critic response was not JSON: ${text.slice(0, 200)}`,
      findings: rubric.checks.map((c) => ({
        checkId: c.id,
        passed: false,
        note: "unparseable critic response",
      })),
    };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return {
      verdict: "REWORK",
      confidence: 0,
      critique: "Critic response was not an object",
      findings: [],
    };
  }
  const obj = parsed as Record<string, unknown>;
  const verdict = obj.verdict === "PASS" ? "PASS" : "REWORK";
  const confidence = clamp01(
    typeof obj.confidence === "number" ? obj.confidence : 0,
  );
  const findingsRaw = Array.isArray(obj.findings) ? obj.findings : [];
  const findings: CriticFinding[] = [];
  for (const f of findingsRaw) {
    if (typeof f !== "object" || f === null) continue;
    const ff = f as Record<string, unknown>;
    if (typeof ff.checkId !== "string") continue;
    const finding: CriticFinding = {
      checkId: ff.checkId,
      passed: Boolean(ff.passed),
    };
    if (typeof ff.note === "string") finding.note = ff.note;
    findings.push(finding);
  }
  const out: CriticVerdict = { verdict, confidence, findings };
  if (typeof obj.critique === "string") out.critique = obj.critique;
  return out;
}

/**
 * Run the Critic against a single proposal. Returns PASS/REWORK plus
 * per-check findings and an overall confidence score.
 *
 * Pass 18 — wraps the Critic's provider call in a `Critic:evaluate` span
 * tagged with `(role=critic, taskId, modelId, rubric.name, cycle)`. After
 * the verdict parses we tag `verdict` + `confidence` so Jaeger can filter
 * on failing cycles at a glance. The span ends in both success and error
 * paths via `finally`.
 */
export async function evaluate(
  input: CriticInput,
  provider: LLMProviderAdapter,
  modelId: string,
  opts: { cycle?: number } = {},
): Promise<CriticVerdict> {
  const tracer = getOrchestratorTracer();
  return tracer.startActiveSpan("Critic:evaluate", async (span) => {
    span.setAttribute(SPAN_ATTR.ROLE, SPAN_ROLE.CRITIC);
    span.setAttribute(SPAN_ATTR.TASK_ID, input.taskId);
    span.setAttribute(SPAN_ATTR.MODEL_ID, modelId);
    span.setAttribute(SPAN_ATTR.RUBRIC_NAME, input.rubric.name);
    span.setAttribute(SPAN_ATTR.CYCLE, opts.cycle ?? 1);
    try {
      const userPrompt = renderCriticPrompt(input);
      const response = await provider.generate({
        systemPrompt: "You are the Critic role in an Actor/Critic loop.",
        userPrompt,
        modelId,
        metadata: { role: "critic", taskId: input.taskId },
      });
      const parsed = parseVerdict(response.text, input.rubric);
      span.setAttribute(SPAN_ATTR.VERDICT, parsed.verdict);
      span.setAttribute(SPAN_ATTR.CONFIDENCE, parsed.confidence);
      return parsed;
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
