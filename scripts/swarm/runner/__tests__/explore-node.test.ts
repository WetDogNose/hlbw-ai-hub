// Pass 14 — unit tests for the `explore` node.
//
// Covers:
//   Test A — immediate stop outcome => goto propose_plan, budget unchanged.
//   Test B — 3 continue outcomes then stop => self-loops 3x, budget 8 -> 5,
//            last hop lands at propose_plan.
//   Test C — budget starts at 0 => straight to propose_plan, no explorer
//            calls happen at all.
//   Test D — filterReadOnlyTools only read-only tools are offered to the
//            explorer (verified via the mocked proposeExplorationStep
//            captured call args).
//
// Run explicitly — lives under scripts/swarm/runner/__tests__/ which is
// excluded from the root `npm test` suite. Invoke via:
//   npx jest --config jest.config.ts \
//     --roots <rootDir>/scripts/swarm/runner/__tests__/ \
//     --testRegex 'explore-node\.test\.ts$'

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks — registered BEFORE the module under test imports.
// ---------------------------------------------------------------------------

jest.mock("@/lib/orchestration/graph", () => ({
  __esModule: true,
  defineGraph: jest.fn((def: unknown) => ({ __def: def })),
}));

jest.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  __esModule: true,
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    listTools: jest
      .fn<() => Promise<{ tools: unknown[] }>>()
      .mockResolvedValue({ tools: [] }),
    callTool: jest
      .fn<() => Promise<{ content: unknown }>>()
      .mockResolvedValue({ content: "mcp-ok" }),
  })),
}));

jest.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  __esModule: true,
  StdioClientTransport: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("../../shared-memory", () => ({
  __esModule: true,
  shareDiscovery: jest
    .fn<(w: string, t: string, d: string) => Promise<void>>()
    .mockResolvedValue(undefined),
  markTaskComplete: jest
    .fn<(t: string, obs: string) => Promise<void>>()
    .mockResolvedValue(undefined),
  getSharedContext: jest
    .fn<(t: string) => Promise<string[]>>()
    .mockResolvedValue([]),
  storeEntity: jest.fn().mockResolvedValue(undefined),
  addObservations: jest.fn().mockResolvedValue(undefined),
  createRelation: jest.fn().mockResolvedValue(undefined),
  shareTaskContext: jest.fn().mockResolvedValue(undefined),
  shareDecision: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    issue: {
      update: jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue({}),
    },
  },
}));

// The explorer module is the unit-under-integration for this suite; mock
// `proposeExplorationStep` so we can script outcomes. `filterReadOnlyTools`
// is kept real — we assert its result is what gets handed to the explorer.
const proposeExplorationStepMock = jest.fn<
  (
    ctx: { allowedTools: Array<{ name: string }> },
    provider: unknown,
    modelId: string,
  ) => Promise<{
    kind: "continue" | "stop";
    nextStep?: { tool: string; args: unknown };
    reason?: string;
  }>
>();

jest.mock("@/lib/orchestration/explorer", () => {
  const actual = jest.requireActual("@/lib/orchestration/explorer") as Record<
    string,
    unknown
  >;
  return {
    __esModule: true,
    ...actual,
    proposeExplorationStep: proposeExplorationStepMock,
  };
});

// ---------------------------------------------------------------------------
// Module under test (imported AFTER jest.mock calls register).
// ---------------------------------------------------------------------------

import {
  nodes,
  NODE_EXPLORE,
  NODE_PROPOSE_PLAN,
  runnerRuntime,
  type RunnerContext,
} from "../nodes";
import {
  registerProvider,
  type GenerationRequest,
  type GenerationResponse,
  type LLMProviderAdapter,
} from "../../providers";

function baseCtx(overrides: Partial<RunnerContext> = {}): RunnerContext {
  return {
    taskId: "task-explore",
    agentCategory: "1_qa",
    modelId: "gemini-3.1-pro",
    worktreePath: "/workspace",
    instruction: "investigate and plan",
    chatHistory: [],
    iterations: 0,
    maxIterations: 5,
    explorationBudget: 8,
    explorationHistory: [],
    ...overrides,
  };
}

class NoopProvider implements LLMProviderAdapter {
  readonly name = "scripted-role";
  async generate(_req: GenerationRequest): Promise<GenerationResponse> {
    return {
      text: "",
      provider: this.name,
      modelId: "stub-model",
      finishReason: "stop",
    };
  }
  async healthcheck(): Promise<boolean> {
    return true;
  }
}

registerProvider(new NoopProvider());

beforeEach(() => {
  proposeExplorationStepMock.mockReset();
  runnerRuntime.mcpClients = {};
  runnerRuntime.mcpToolDefinitions = [];
  runnerRuntime.mcpInitialized = false;
  runnerRuntime.roleProviderName = "scripted-role";
  runnerRuntime.roleModelId = "stub-model";
  process.env.NODE_ENV = "test";
});

// ---------------------------------------------------------------------------
// Test A — immediate stop.
// ---------------------------------------------------------------------------

describe("explore node — test A (immediate stop)", () => {
  it("goes straight to propose_plan with budget unchanged", async () => {
    proposeExplorationStepMock.mockResolvedValueOnce({
      kind: "stop",
      reason: "enough_info",
    });
    const ctx = baseCtx({ explorationBudget: 8 });
    const outcome = await nodes[NODE_EXPLORE].run(ctx);
    expect(outcome.kind).toBe("goto");
    if (outcome.kind !== "goto") throw new Error("unreachable");
    expect(outcome.next).toBe(NODE_PROPOSE_PLAN);
    // stop does not decrement budget; the node only emits explorationNotes.
    expect(outcome.contextPatch?.explorationBudget).toBeUndefined();
    expect(typeof outcome.contextPatch?.explorationNotes).toBe("string");
    expect(proposeExplorationStepMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Test B — 3 continues, then stop. Budget drains 8 -> 5.
// ---------------------------------------------------------------------------

describe("explore node — test B (self-loop 3x then stop)", () => {
  it("self-loops three times, decrements budget, ends at propose_plan", async () => {
    proposeExplorationStepMock
      .mockResolvedValueOnce({
        kind: "continue",
        nextStep: { tool: "Read", args: { filePath: "nope.md" } },
      })
      .mockResolvedValueOnce({
        kind: "continue",
        nextStep: { tool: "Grep", args: { pattern: "foo" } },
      })
      .mockResolvedValueOnce({
        kind: "continue",
        nextStep: { tool: "Glob", args: { pattern: "*.ts" } },
      })
      .mockResolvedValueOnce({ kind: "stop", reason: "done" });

    // Simulate 3 iterations of the graph driver re-entering explore.
    let ctx: RunnerContext = baseCtx({ explorationBudget: 8 });
    for (let i = 0; i < 3; i++) {
      const out = await nodes[NODE_EXPLORE].run(ctx);
      expect(out.kind).toBe("goto");
      if (out.kind !== "goto") throw new Error("unreachable");
      expect(out.next).toBe(NODE_EXPLORE);
      const patch = out.contextPatch ?? {};
      ctx = {
        ...ctx,
        explorationHistory:
          (patch.explorationHistory as RunnerContext["explorationHistory"]) ??
          ctx.explorationHistory,
        explorationBudget:
          (patch.explorationBudget as number) ?? ctx.explorationBudget,
      };
    }
    // After three continues: budget 8 -> 5, history length 3.
    expect(ctx.explorationBudget).toBe(5);
    expect(ctx.explorationHistory.length).toBe(3);

    // Final iteration returns stop -> propose_plan.
    const final = await nodes[NODE_EXPLORE].run(ctx);
    expect(final.kind).toBe("goto");
    if (final.kind !== "goto") throw new Error("unreachable");
    expect(final.next).toBe(NODE_PROPOSE_PLAN);
    expect(proposeExplorationStepMock).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// Test C — budget 0 short-circuits.
// ---------------------------------------------------------------------------

describe("explore node — test C (budget exhausted on entry)", () => {
  it("routes straight to propose_plan without calling proposeExplorationStep", async () => {
    const ctx = baseCtx({ explorationBudget: 0 });
    const outcome = await nodes[NODE_EXPLORE].run(ctx);
    expect(outcome.kind).toBe("goto");
    if (outcome.kind !== "goto") throw new Error("unreachable");
    expect(outcome.next).toBe(NODE_PROPOSE_PLAN);
    expect(proposeExplorationStepMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test D — only read-only tools are offered to proposeExplorationStep.
// ---------------------------------------------------------------------------

describe("explore node — test D (read-only tool filter)", () => {
  it("filters out mutating tools before calling proposeExplorationStep", async () => {
    proposeExplorationStepMock.mockResolvedValueOnce({
      kind: "stop",
      reason: "inspected",
    });
    const mixedCatalog = [
      { name: "get_status", description: "read status" },
      { name: "create_user", description: "make user" },
      { name: "list_tasks", description: "list tasks" },
      { name: "delete_row", description: "delete a row" },
      { name: "Grep", description: "search" },
      { name: "Write", description: "write file" },
      { name: "mcp__x__pull_request_read", description: "mcp read" },
    ];
    const ctx = baseCtx({
      explorationBudget: 2,
      mcpTools: mixedCatalog,
    });
    await nodes[NODE_EXPLORE].run(ctx);
    expect(proposeExplorationStepMock).toHaveBeenCalledTimes(1);
    const firstCall = proposeExplorationStepMock.mock.calls[0];
    const passedCtx = firstCall[0] as { allowedTools: Array<{ name: string }> };
    const names = passedCtx.allowedTools.map((t) => t.name).sort();
    expect(names).toEqual(
      ["get_status", "list_tasks", "Grep", "mcp__x__pull_request_read"].sort(),
    );
  });
});
