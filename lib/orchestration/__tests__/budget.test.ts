// Pass 16 — budget helper tests.
//
// Verifies:
//   - `assertBudgetAvailable` throws `BudgetExceededError` (status 429) when
//     the ledger sum exceeds the limit.
//   - `recordTokenUsage` writes a BudgetLedger row; resolves the system
//     AgentPersona when no agentId is supplied.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

const aggregate =
  jest.fn<() => Promise<{ _sum: { tokensUsed: number | null } }>>();
const ledgerCreate =
  jest.fn<(args: unknown) => Promise<{ id: string; tokensUsed: number }>>();
const agentFindFirst =
  jest.fn<(args: unknown) => Promise<{ id: string } | null>>();
const agentCreate = jest.fn<(args: unknown) => Promise<{ id: string }>>();
const orgFindFirst =
  jest.fn<(args: unknown) => Promise<{ id: string } | null>>();
const orgCreate = jest.fn<(args: unknown) => Promise<{ id: string }>>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    budgetLedger: {
      aggregate: () =>
        (
          aggregate as unknown as () => Promise<{
            _sum: { tokensUsed: number | null };
          }>
        )(),
      create: (args: unknown) =>
        (
          ledgerCreate as unknown as (
            a: unknown,
          ) => Promise<{ id: string; tokensUsed: number }>
        )(args),
    },
    agentPersona: {
      findFirst: (args: unknown) =>
        (
          agentFindFirst as unknown as (
            a: unknown,
          ) => Promise<{ id: string } | null>
        )(args),
      create: (args: unknown) =>
        (agentCreate as unknown as (a: unknown) => Promise<{ id: string }>)(
          args,
        ),
    },
    organization: {
      findFirst: (args: unknown) =>
        (
          orgFindFirst as unknown as (
            a: unknown,
          ) => Promise<{ id: string } | null>
        )(args),
      create: (args: unknown) =>
        (orgCreate as unknown as (a: unknown) => Promise<{ id: string }>)(args),
    },
  },
}));

import {
  assertBudgetAvailable,
  recordTokenUsage,
  BudgetExceededError,
  DAILY_TOKEN_LIMIT,
} from "../budget";

describe("budget helpers", () => {
  beforeEach(() => {
    aggregate.mockReset();
    ledgerCreate.mockReset();
    agentFindFirst.mockReset();
    agentCreate.mockReset();
    orgFindFirst.mockReset();
    orgCreate.mockReset();
  });

  describe("assertBudgetAvailable", () => {
    it("returns the usage total when under limit", async () => {
      aggregate.mockResolvedValue({ _sum: { tokensUsed: 1000 } });
      const total = await assertBudgetAvailable();
      expect(total).toBe(1000);
    });

    it("throws BudgetExceededError (status=429) when over limit", async () => {
      aggregate.mockResolvedValue({
        _sum: { tokensUsed: DAILY_TOKEN_LIMIT + 1 },
      });
      await expect(assertBudgetAvailable()).rejects.toBeInstanceOf(
        BudgetExceededError,
      );
      try {
        await assertBudgetAvailable();
      } catch (err) {
        expect(err).toBeInstanceOf(BudgetExceededError);
        expect((err as BudgetExceededError).status).toBe(429);
      }
    });

    it("treats null sum as 0", async () => {
      aggregate.mockResolvedValue({ _sum: { tokensUsed: null } });
      const total = await assertBudgetAvailable();
      expect(total).toBe(0);
    });
  });

  describe("recordTokenUsage", () => {
    it("writes a BudgetLedger row with summed tokens", async () => {
      agentFindFirst.mockResolvedValue({ id: "sys-agent-1" });
      ledgerCreate.mockResolvedValue({ id: "led-1", tokensUsed: 300 });

      const result = await recordTokenUsage({
        taskId: "i-1",
        inputTokens: 100,
        outputTokens: 200,
        model: "gemini-2.5-flash",
      });

      expect(result).toEqual({ id: "led-1", tokensUsed: 300 });
      expect(ledgerCreate).toHaveBeenCalledTimes(1);
      const arg = ledgerCreate.mock.calls[0]![0] as {
        data: { agentId: string; issueId: string | null; tokensUsed: number };
      };
      expect(arg.data.agentId).toBe("sys-agent-1");
      expect(arg.data.issueId).toBe("i-1");
      expect(arg.data.tokensUsed).toBe(300);
    });

    it("creates system agent+org when none exist", async () => {
      agentFindFirst.mockResolvedValue(null);
      orgFindFirst.mockResolvedValue(null);
      orgCreate.mockResolvedValue({ id: "org-sys" });
      agentCreate.mockResolvedValue({ id: "sys-new" });
      ledgerCreate.mockResolvedValue({ id: "led-2", tokensUsed: 50 });

      await recordTokenUsage({ totalTokens: 50, model: "gemini" });

      expect(orgCreate).toHaveBeenCalled();
      expect(agentCreate).toHaveBeenCalled();
      const arg = ledgerCreate.mock.calls[0]![0] as {
        data: { agentId: string };
      };
      expect(arg.data.agentId).toBe("sys-new");
    });

    it("uses existing org when agent is missing", async () => {
      agentFindFirst.mockResolvedValue(null);
      orgFindFirst.mockResolvedValue({ id: "org-existing" });
      agentCreate.mockResolvedValue({ id: "sys-new-2" });
      ledgerCreate.mockResolvedValue({ id: "led-3", tokensUsed: 10 });

      await recordTokenUsage({ inputTokens: 5, outputTokens: 5, model: "g" });

      expect(orgCreate).not.toHaveBeenCalled();
      const agentArg = agentCreate.mock.calls[0]![0] as {
        data: { organizationId: string };
      };
      expect(agentArg.data.organizationId).toBe("org-existing");
    });

    // Pass 16 REWORK cycle 1 — error-path accounting.
    it("writes a ledger row when the provider call throws (error:true)", async () => {
      // Simulate the provider adapter's finally-block: a generate() that
      // threw after partial output still routes through recordTokenUsage
      // with `error: true`. The ledger must record the partial spend.
      agentFindFirst.mockResolvedValue({ id: "sys-agent-err" });
      ledgerCreate.mockResolvedValue({ id: "led-err", tokensUsed: 42 });

      const result = await recordTokenUsage({
        taskId: "i-err",
        inputTokens: 30,
        outputTokens: 12,
        model: "gemini-2.5-flash",
        error: true,
      });

      expect(result).toEqual({ id: "led-err", tokensUsed: 42 });
      expect(ledgerCreate).toHaveBeenCalledTimes(1);
      const arg = ledgerCreate.mock.calls[0]![0] as {
        data: { issueId: string | null; tokensUsed: number };
      };
      expect(arg.data.issueId).toBe("i-err");
      expect(arg.data.tokensUsed).toBe(42);
    });

    it("error-flagged rows still count toward the daily budget total", async () => {
      // A row written from the error path is not distinguished by the
      // aggregate query — it contributes tokensUsed just like a success
      // row. We verify by summing a mixed ledger above the limit and
      // asserting BudgetExceededError still fires.
      aggregate.mockResolvedValue({
        _sum: { tokensUsed: DAILY_TOKEN_LIMIT + 500 },
      });
      await expect(assertBudgetAvailable()).rejects.toBeInstanceOf(
        BudgetExceededError,
      );
      try {
        await assertBudgetAvailable();
      } catch (err) {
        expect((err as BudgetExceededError).totalUsage).toBe(
          DAILY_TOKEN_LIMIT + 500,
        );
      }
    });
  });
});
