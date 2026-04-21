// Pass 16 — Budget ledger helpers.
//
// `assertBudgetAvailable()` enforces the Paperclip daily-token ceiling (5M)
// against the sum of `BudgetLedger.tokensUsed`. Throws `BudgetExceededError`
// with `status = 429` when the ceiling is crossed.
//
// `recordTokenUsage()` writes a single `BudgetLedger` row per provider call.
// It resolves the `agentId` foreign key by upserting a singleton
// `AgentPersona` named `__system` for the `__system` organization, so the
// swarm can record spend without every task being pre-linked to a human
// agent. Issue linkage is optional.

import prisma from "@/lib/prisma";
import { getRuntimeConfig } from "./runtime-config";

export const DAILY_TOKEN_LIMIT = 5_000_000;

/**
 * Return the effective daily token ceiling. Reads
 * runtime-config `budget_daily_ceiling_tokens` (falling through env +
 * hardcoded default). Callers that have a hardcoded override can still
 * pass a literal `limit` to `assertBudgetAvailable`.
 */
export async function getEffectiveTokenCeiling(): Promise<number> {
  const eff = await getRuntimeConfig(
    "budget_daily_ceiling_tokens",
    "SCION_BUDGET_DAILY_CEILING_TOKENS",
    DAILY_TOKEN_LIMIT,
  );
  return typeof eff.value === "number" && Number.isFinite(eff.value)
    ? eff.value
    : DAILY_TOKEN_LIMIT;
}

export const SYSTEM_AGENT_NAME = "__system";
export const SYSTEM_ORG_NAME = "__system";

export class BudgetExceededError extends Error {
  readonly status = 429;
  readonly totalUsage: number;
  readonly limit: number;
  constructor(totalUsage: number, limit: number = DAILY_TOKEN_LIMIT) {
    super(
      `Budget Interception: Daily Token Limit Exceeded (${totalUsage} / ${limit})`,
    );
    this.name = "BudgetExceededError";
    this.totalUsage = totalUsage;
    this.limit = limit;
  }
}

export interface RecordTokenUsageInput {
  taskId?: string | null;
  agentId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
  costUsd?: number;
  /**
   * Pass 16 REWORK cycle 1 — marks a row emitted from an error path
   * (provider threw after partial usage). The row still counts against
   * the daily token limit; the flag is informational, surfaced through
   * the logger only (no schema change required).
   */
  error?: boolean;
}

/**
 * Sum `BudgetLedger.tokensUsed` across all rows. Throws `BudgetExceededError`
 * when the sum exceeds `DAILY_TOKEN_LIMIT`. Pass 16 keeps the same ceiling
 * semantics the original `/api/scion/execute` enforced.
 */
export async function assertBudgetAvailable(limit?: number): Promise<number> {
  const effectiveLimit =
    typeof limit === "number" && Number.isFinite(limit)
      ? limit
      : await getEffectiveTokenCeiling();
  const sumResult = await prisma.budgetLedger.aggregate({
    _sum: { tokensUsed: true },
  });
  const totalUsage = sumResult._sum.tokensUsed ?? 0;
  if (totalUsage > effectiveLimit) {
    throw new BudgetExceededError(totalUsage, effectiveLimit);
  }
  return totalUsage;
}

/**
 * Return (and if necessary create) the singleton `Organization` used for
 * system-owned rows (agents without a human tenant, seed goals created via
 * the SCION admin UI, etc.). Exported because the Goals API needs the same
 * FK resolution pattern.
 */
export async function ensureSystemOrg(): Promise<string> {
  const existingOrg = await prisma.organization.findFirst({
    where: { name: SYSTEM_ORG_NAME },
  });
  if (existingOrg) return existingOrg.id;
  const created = await prisma.organization.create({
    data: { name: SYSTEM_ORG_NAME },
  });
  return created.id;
}

/**
 * Return (and if necessary create) the singleton `AgentPersona` used by the
 * swarm/providers pipeline when no human-assigned agent exists. Kept internal
 * to this module; callers only supply `taskId` + tokens.
 */
async function ensureSystemAgentId(): Promise<string> {
  const existingAgent = await prisma.agentPersona.findFirst({
    where: { name: SYSTEM_AGENT_NAME },
  });
  if (existingAgent) return existingAgent.id;

  const organizationId = await ensureSystemOrg();

  const created = await prisma.agentPersona.create({
    data: {
      name: SYSTEM_AGENT_NAME,
      role: "SYSTEM",
      organizationId,
    },
  });
  return created.id;
}

/**
 * Append one `BudgetLedger` row recording provider token usage.
 *
 * `totalTokens` is computed as `inputTokens + outputTokens` when not provided.
 * The row is always created — even when `totalTokens === 0` — so the ledger
 * history captures every provider call. Cost is stored in USD (zero by
 * default; providers that know their price should pass `costUsd`).
 */
export async function recordTokenUsage(
  input: RecordTokenUsageInput,
): Promise<{ id: string; tokensUsed: number }> {
  const totalTokens =
    typeof input.totalTokens === "number"
      ? input.totalTokens
      : (input.inputTokens ?? 0) + (input.outputTokens ?? 0);

  const agentId = input.agentId ?? (await ensureSystemAgentId());

  if (input.error) {
    console.warn(
      `[recordTokenUsage] error-path spend: taskId=${input.taskId ?? "null"} tokens=${totalTokens} model=${input.model ?? "unknown"}`,
    );
  }

  const row = await prisma.budgetLedger.create({
    data: {
      agentId,
      issueId: input.taskId ?? null,
      tokensUsed: Math.max(0, Math.floor(totalTokens)),
      cost: input.costUsd ?? 0,
    },
  });

  return { id: row.id, tokensUsed: row.tokensUsed };
}
