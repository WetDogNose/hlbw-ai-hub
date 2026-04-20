// Pass 11 — Reflection-loop orchestrator.
//
// IMPORTANT: this orchestrator is NOT the StateGraph orchestrator from
// pass 8 (`lib/orchestration/graph/StateGraph.ts`). This module is a
// narrowly-scoped helper that drives the Actor→Critic→(maybe re-Actor)
// cycle inside a single graph node. The StateGraph keeps its role as
// the durable task-level orchestrator; this one is a per-node reflection
// loop.
//
// The loop:
//   1. Actor proposes.
//   2. Critic scores.
//   3. If PASS with confidence >= minConfidenceForPass, stop.
//      Otherwise feed the Critic's critique back to the Actor.
//   4. Repeat up to maxReworkCycles cycles. On exhaustion, return the
//      best proposal seen (by confidence) with the last verdict.

import type { LLMProviderAdapter } from "../providers";
import { propose as actorPropose } from "./actor";
import type { ActorInput, ActorProposal } from "./actor";
import { evaluate as criticEvaluate } from "./critic";
import type { CriticInput, CriticVerdict } from "./critic";
import { loadRubric } from "@/lib/orchestration/rubrics";
import { getOrchestratorTracer } from "@/lib/orchestration/tracing/tracer";
import { SPAN_ATTR, SPAN_ROLE } from "@/lib/orchestration/tracing/attrs";
// Pass 19 — Turn-PPO seam. `recordTurn` is fire-and-forget per directive #4
// and MUST be try/catch'd so a broken TurnCritic never breaks orchestration.
import { getTurnCritic, hashState } from "@/lib/rl";
import type { TurnSnapshot } from "@/lib/rl";

export interface OrchestratorOptions {
  /** Maximum number of Actor/Critic cycles before giving up. Defaults to 3. */
  maxReworkCycles?: number;
  /** Minimum Critic confidence required for an approved verdict. Defaults to 0.85. */
  minConfidenceForPass?: number;
  /**
   * Pass 12 — agent category used to resolve the per-category rubric when
   * callers use `runActorCriticLoopForCategory`. Ignored by the explicit
   * `runActorCriticLoop(input, rubric, ...)` form so older call sites keep
   * working.
   */
  agentCategory?: string | null;
}

export interface ApprovedOutcome {
  kind: "approved";
  proposal: ActorProposal;
  cyclesUsed: number;
  lastVerdict: CriticVerdict;
}

export interface ExhaustedOutcome {
  kind: "exhausted";
  lastProposal: ActorProposal;
  cyclesUsed: number;
  lastVerdict: CriticVerdict;
}

export type LoopOutcome = ApprovedOutcome | ExhaustedOutcome;

/**
 * Run one reflection cycle (Actor → Critic). Exported for testability of
 * individual cycles; typical callers use `runActorCriticLoop`.
 *
 * Pass 13 — the `CriticInput` is built via an explicit destructure of the
 * Actor proposal. No `...proposal` spread anywhere; a jest test under
 * `scripts/swarm/roles/__tests__/context-isolation.test.ts` greps this file
 * to enforce that discipline.
 */
export async function runSingleCycle(
  input: ActorInput,
  rubric: CriticInput["rubric"],
  provider: LLMProviderAdapter,
  modelId: string,
  opts: { cycle?: number } = {},
): Promise<{ proposal: ActorProposal; verdict: CriticVerdict }> {
  const cycle = opts.cycle ?? 1;
  const proposal = await actorPropose(input, provider, modelId, { cycle });
  const { kind, plan, toolCall, finalMessage } = proposal;
  const criticInput: CriticInput = {
    taskId: input.taskId,
    taskInstruction: input.taskInstruction,
    proposal: { kind, plan, toolCall, finalMessage },
    rubric,
  };
  const verdict = await criticEvaluate(criticInput, provider, modelId, {
    cycle,
  });
  return { proposal, verdict };
}

/**
 * Drive the Actor/Critic loop to an approved proposal or exhaustion.
 */
export async function runActorCriticLoop(
  input: ActorInput,
  rubric: CriticInput["rubric"],
  provider: LLMProviderAdapter,
  modelId: string,
  opts: OrchestratorOptions = {},
): Promise<LoopOutcome> {
  const maxCycles = opts.maxReworkCycles ?? 3;
  const minConfidence = opts.minConfidenceForPass ?? 0.85;

  // Pass 18 — wrap the full reflection loop in an `Orchestrator:loop` span
  // so Jaeger shows Actor→Critic→Actor cycles as children of one parent.
  // The `CYCLE` attribute is set per iteration via `setAttribute` so the
  // span reflects the most recent cycle when the loop exits.
  const tracer = getOrchestratorTracer();
  return tracer.startActiveSpan("Orchestrator:loop", async (span) => {
    span.setAttribute(SPAN_ATTR.ROLE, SPAN_ROLE.ORCHESTRATOR);
    span.setAttribute(SPAN_ATTR.TASK_ID, input.taskId);
    span.setAttribute(SPAN_ATTR.MODEL_ID, modelId);
    span.setAttribute(SPAN_ATTR.RUBRIC_NAME, rubric.name);

    let lastProposal: ActorProposal | undefined;
    let lastVerdict: CriticVerdict | undefined;
    let bestProposal: ActorProposal | undefined;
    let bestVerdict: CriticVerdict | undefined;
    let currentInput: ActorInput = input;

    // Pass 19 — accumulate turn snapshots + reward signals for the end-of-
    // loop `computeAdvantage` fire-and-forget call.
    const turnHistory: TurnSnapshot[] = [];
    const turnRewards: number[] = [];

    try {
      for (let cycle = 1; cycle <= maxCycles; cycle++) {
        span.setAttribute(SPAN_ATTR.CYCLE, cycle);
        const cycleStartedAt = Date.now();
        const cycleStartedIso = new Date(cycleStartedAt).toISOString();
        const stateHash = hashState({
          taskId: currentInput.taskId,
          cycle,
          critique: currentInput.critique ?? null,
          taskInstruction: currentInput.taskInstruction,
        });
        const { proposal, verdict } = await runSingleCycle(
          currentInput,
          rubric,
          provider,
          modelId,
          { cycle },
        );
        lastProposal = proposal;
        lastVerdict = verdict;
        if (!bestVerdict || verdict.confidence > bestVerdict.confidence) {
          bestProposal = proposal;
          bestVerdict = verdict;
        }

        // Pass 19 — record the turn. Try/catch is MANDATORY; a broken
        // TurnCritic must never surface into orchestration. Wrapped in its
        // own OTEL span so failures are visible in Jaeger.
        const durationMs = Date.now() - cycleStartedAt;
        const snap: TurnSnapshot = {
          taskId: currentInput.taskId,
          issueId: currentInput.taskId,
          node: "actor_critic_cycle",
          role: SPAN_ROLE.ORCHESTRATOR,
          stateHash,
          action: {
            kind: proposal.kind,
            summary:
              proposal.plan ??
              proposal.finalMessage ??
              (proposal.toolCall
                ? `tool:${proposal.toolCall.name}`
                : "no_action"),
          },
          outcome: "ok",
          rewardSignal: verdict.confidence,
          durationMs,
          modelId,
          timestamp: cycleStartedIso,
        };
        turnHistory.push(snap);
        turnRewards.push(verdict.confidence);
        await tracer.startActiveSpan("RL:recordTurn", async (recordSpan) => {
          recordSpan.setAttribute(SPAN_ATTR.TASK_ID, snap.taskId);
          recordSpan.setAttribute(SPAN_ATTR.ROLE, SPAN_ROLE.ORCHESTRATOR);
          recordSpan.setAttribute(SPAN_ATTR.CYCLE, cycle);
          try {
            await getTurnCritic().recordTurn(snap);
          } catch (err) {
            recordSpan.recordException(err as Error);
          } finally {
            recordSpan.end();
          }
        });

        if (verdict.verdict === "PASS" && verdict.confidence >= minConfidence) {
          span.setAttribute(SPAN_ATTR.VERDICT, verdict.verdict);
          span.setAttribute(SPAN_ATTR.CONFIDENCE, verdict.confidence);
          // Pass 19 — fire-and-forget advantage computation. Do NOT await.
          void (async () => {
            try {
              await getTurnCritic().computeAdvantage(turnHistory, turnRewards);
            } catch {
              // Swallow — RL writes MUST NOT break orchestration.
            }
          })();
          return {
            kind: "approved",
            proposal,
            cyclesUsed: cycle,
            lastVerdict: verdict,
          } as LoopOutcome;
        }
        // Feed critique back for the next cycle.
        currentInput = {
          ...currentInput,
          critique: verdict.critique ?? "Proposal did not meet the rubric.",
        };
      }

      // Exhausted — return the best proposal seen so the caller can
      // decide whether to escalate or accept degraded output.
      const finalProposal = bestProposal ?? lastProposal;
      const finalVerdict = bestVerdict ?? lastVerdict;
      if (!finalProposal || !finalVerdict) {
        throw new Error(
          "runActorCriticLoop: no cycles executed — did maxReworkCycles fall below 1?",
        );
      }
      span.setAttribute(SPAN_ATTR.VERDICT, finalVerdict.verdict);
      span.setAttribute(SPAN_ATTR.CONFIDENCE, finalVerdict.confidence);
      // Pass 19 — fire-and-forget advantage computation on the exhausted
      // path too. Do NOT await. Swallowed errors never surface.
      void (async () => {
        try {
          await getTurnCritic().computeAdvantage(turnHistory, turnRewards);
        } catch {
          // Swallow — RL writes MUST NOT break orchestration.
        }
      })();
      return {
        kind: "exhausted",
        lastProposal: finalProposal,
        cyclesUsed: maxCycles,
        lastVerdict: finalVerdict,
      } as LoopOutcome;
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Pass 12 — category-aware convenience wrapper. Resolves the rubric from
 * the registry in `@/lib/orchestration/rubrics` by `agentCategory`, then
 * delegates to `runActorCriticLoop`. Unknown or null categories fall back
 * to the default rubric. Call sites that already have a concrete rubric
 * should keep using `runActorCriticLoop` directly.
 */
export async function runActorCriticLoopForCategory(
  input: ActorInput,
  agentCategory: string | null | undefined,
  provider: LLMProviderAdapter,
  modelId: string,
  opts: OrchestratorOptions = {},
): Promise<LoopOutcome> {
  const rubric = loadRubric(agentCategory);
  return runActorCriticLoop(input, rubric, provider, modelId, opts);
}
