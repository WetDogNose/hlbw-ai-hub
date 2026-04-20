// Pass 9 — unit tests for the agent-runner node registry.
//
// All side-effecting dependencies are mocked: the StateGraph runtime
// (`@/lib/orchestration/graph`), the Gemini SDK, the MCP client, and
// shared-memory. Tests exercise each node's `run(ctx)` directly and assert
// the returned `NodeOutcome` + context patch.
//
// Run explicitly — excluded from the default `npm test` pass because it
// lives under `scripts/swarm/__tests__/` only indirectly (via the
// `scripts/swarm/runner/__tests__/` subdir, ignored by jest.config.ts
// testPathIgnorePatterns).

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks — registered BEFORE the module under test is imported.
// ---------------------------------------------------------------------------

jest.mock("@/lib/orchestration/graph", () => ({
  __esModule: true,
  defineGraph: jest.fn((def: unknown) => ({ __def: def })),
}));

const mockGenerateContent = jest.fn<
  () => Promise<{
    response: { text: () => string; functionCalls?: () => unknown[] };
  }>
>();

jest.mock("@google/generative-ai", () => ({
  __esModule: true,
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({
      generateContent: mockGenerateContent,
    }),
  })),
  SchemaType: {
    OBJECT: "object",
    STRING: "string",
    ARRAY: "array",
  },
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
      .mockResolvedValue({ content: "ok" }),
  })),
}));

jest.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  __esModule: true,
  StdioClientTransport: jest.fn().mockImplementation(() => ({})),
}));

const shareDiscoveryMock = jest
  .fn<(workerId: string, taskId: string, discovery: string) => Promise<void>>()
  .mockResolvedValue(undefined);
const markTaskCompleteMock = jest
  .fn<(taskId: string, obs: string) => Promise<void>>()
  .mockResolvedValue(undefined);
const getSharedContextMock = jest
  .fn<(taskId: string) => Promise<string[]>>()
  .mockResolvedValue(["[discovery] prior trace"]);

jest.mock("../../shared-memory", () => ({
  __esModule: true,
  shareDiscovery: shareDiscoveryMock,
  markTaskComplete: markTaskCompleteMock,
  getSharedContext: getSharedContextMock,
  storeEntity: jest.fn().mockResolvedValue(undefined),
  addObservations: jest.fn().mockResolvedValue(undefined),
  createRelation: jest.fn().mockResolvedValue(undefined),
  shareTaskContext: jest.fn().mockResolvedValue(undefined),
  shareDecision: jest.fn().mockResolvedValue(undefined),
}));

// Pass 12 — mock the prisma client so `markIssueNeedsHuman` does not
// reach a real database. The test asserts the update was called with the
// needs_human status.
const issueUpdateMock = jest
  .fn<(args: unknown) => Promise<unknown>>()
  .mockResolvedValue({});

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    issue: {
      update: issueUpdateMock,
    },
  },
}));

// ---------------------------------------------------------------------------
// Module under test (imported AFTER jest.mock calls register).
// ---------------------------------------------------------------------------

import {
  nodes,
  defineAgentGraph,
  NODE_INIT_MCP,
  NODE_BUILD_CONTEXT,
  NODE_EXPLORE,
  NODE_PROPOSE_PLAN,
  NODE_EXECUTE_STEP,
  NODE_RECORD_OBSERVATION,
  NODE_EVALUATE_COMPLETION,
  NODE_COMMIT_OR_LOOP,
  INTERRUPT_REASON_ACTOR_CRITIC_EXHAUSTED,
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
    taskId: "task-abc",
    agentCategory: "1_qa",
    modelId: "gemini-3.1-pro",
    worktreePath: "/workspace",
    instruction: "do the thing",
    chatHistory: [],
    iterations: 0,
    maxIterations: 5,
    ...overrides,
  };
}

// Pass 11 — scripted provider for Actor/Critic mocking. The node's
// orchestrator looks up `runnerRuntime.roleProviderName` in the provider
// registry, so we install a test provider under a stable name.
class ScriptedRoleProvider implements LLMProviderAdapter {
  readonly name = "scripted-role";
  public queue: string[] = [];
  public calls: GenerationRequest[] = [];
  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    this.calls.push(request);
    const text = this.queue.shift();
    if (text === undefined) {
      throw new Error("ScriptedRoleProvider: queue exhausted");
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

const scriptedRoleProvider = new ScriptedRoleProvider();
registerProvider(scriptedRoleProvider);

function queueActorCritic(
  pairs: Array<{ actor: object; critic: object }>,
): void {
  scriptedRoleProvider.queue = [];
  for (const p of pairs) {
    scriptedRoleProvider.queue.push(JSON.stringify(p.actor));
    scriptedRoleProvider.queue.push(JSON.stringify(p.critic));
  }
}

beforeEach(() => {
  mockGenerateContent.mockReset();
  shareDiscoveryMock.mockClear();
  markTaskCompleteMock.mockClear();
  getSharedContextMock.mockClear();
  issueUpdateMock.mockClear();
  runnerRuntime.mcpClients = {};
  runnerRuntime.mcpToolDefinitions = [];
  runnerRuntime.mcpInitialized = false;
  runnerRuntime.genAI = null;
  runnerRuntime.model = null;
  runnerRuntime.roleProviderName = "scripted-role";
  runnerRuntime.roleModelId = "stub-model";
  scriptedRoleProvider.queue = [];
  scriptedRoleProvider.calls = [];
  process.env.GEMINI_API_KEY = "test-key";
});

// ---------------------------------------------------------------------------
// Node registry structure
// ---------------------------------------------------------------------------

describe("node registry", () => {
  it("exports all eight expected nodes (pass 14 added explore)", () => {
    expect(Object.keys(nodes).sort()).toEqual(
      [
        NODE_INIT_MCP,
        NODE_BUILD_CONTEXT,
        NODE_EXPLORE,
        NODE_PROPOSE_PLAN,
        NODE_EXECUTE_STEP,
        NODE_RECORD_OBSERVATION,
        NODE_EVALUATE_COMPLETION,
        NODE_COMMIT_OR_LOOP,
      ].sort(),
    );
  });

  it("defineAgentGraph wires nodes into the StateGraph helper", () => {
    const g = defineAgentGraph() as unknown as { __def: unknown };
    expect(g.__def).toBeDefined();
    expect((g.__def as { startNode: string }).startNode).toBe(NODE_INIT_MCP);
  });
});

// ---------------------------------------------------------------------------
// init_mcp
// ---------------------------------------------------------------------------

describe("init_mcp", () => {
  it("returns goto build_context and patches mcpTools (no config on disk)", async () => {
    // No /etc/mcp_configs path on the test host — the node logs a warning
    // and continues with an empty tool list.
    const outcome = await nodes[NODE_INIT_MCP].run(baseCtx());
    expect(outcome.kind).toBe("goto");
    if (outcome.kind !== "goto") throw new Error("unreachable");
    expect(outcome.next).toBe(NODE_BUILD_CONTEXT);
    expect(outcome.contextPatch?.mcpTools).toBeDefined();
    expect(Array.isArray(outcome.contextPatch?.mcpTools)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// build_context
// ---------------------------------------------------------------------------

describe("build_context", () => {
  it("populates systemPrompt and routes to explore (pass 14)", async () => {
    const outcome = await nodes[NODE_BUILD_CONTEXT].run(baseCtx());
    expect(outcome.kind).toBe("goto");
    if (outcome.kind !== "goto") throw new Error("unreachable");
    expect(outcome.next).toBe(NODE_EXPLORE);
    expect(typeof outcome.contextPatch?.systemPrompt).toBe("string");
    expect(
      (outcome.contextPatch?.systemPrompt as string).length,
    ).toBeGreaterThan(0);
    expect(getSharedContextMock).toHaveBeenCalledWith("task-abc");
  });
});

// ---------------------------------------------------------------------------
// propose_plan
// ---------------------------------------------------------------------------

describe("propose_plan", () => {
  it("returns goto execute_step and patches plan when Actor proposal passes Critic", async () => {
    queueActorCritic([
      {
        actor: { kind: "plan", plan: "draft plan alpha" },
        critic: {
          verdict: "PASS",
          confidence: 0.9,
          findings: [{ checkId: "progress", passed: true }],
        },
      },
    ]);
    const outcome = await nodes[NODE_PROPOSE_PLAN].run(baseCtx());
    expect(outcome.kind).toBe("goto");
    if (outcome.kind !== "goto") throw new Error("unreachable");
    expect(outcome.next).toBe(NODE_EXECUTE_STEP);
    expect(outcome.contextPatch?.plan).toBe("draft plan alpha");
  });

  // Pass 12 — the orchestrator's exhausted outcome now flips the parent
  // Issue to `needs_human` and returns an `interrupt` NodeOutcome with
  // reason `actor_critic_exhausted`. The StateGraph runtime translates
  // the interrupt into `task_graph_state.status = "interrupted"` +
  // `interruptReason` preserved.
  it("interrupts with needs_human when Critic reworks the plan three times (pass 12)", async () => {
    queueActorCritic([
      {
        actor: { kind: "plan", plan: "v1" },
        critic: {
          verdict: "REWORK",
          confidence: 0.2,
          critique: "nope 1",
          findings: [{ checkId: "progress", passed: false }],
        },
      },
      {
        actor: { kind: "plan", plan: "v2" },
        critic: {
          verdict: "REWORK",
          confidence: 0.2,
          critique: "nope 2",
          findings: [{ checkId: "progress", passed: false }],
        },
      },
      {
        actor: { kind: "plan", plan: "v3" },
        critic: {
          verdict: "REWORK",
          confidence: 0.2,
          critique: "nope 3",
          findings: [{ checkId: "progress", passed: false }],
        },
      },
    ]);
    const outcome = await nodes[NODE_PROPOSE_PLAN].run(baseCtx());
    expect(outcome.kind).toBe("interrupt");
    if (outcome.kind !== "interrupt") throw new Error("unreachable");
    expect(outcome.reason).toBe(INTERRUPT_REASON_ACTOR_CRITIC_EXHAUSTED);
    // Parent Issue was flipped to needs_human.
    expect(issueUpdateMock).toHaveBeenCalledWith({
      where: { id: "task-abc" },
      data: { status: "needs_human" },
    });
    // The context patch records the cycle count for the audit trail.
    expect((outcome.contextPatch?.error as { message: string }).message).toBe(
      "plan_rejected_after_3_cycles",
    );
  });
});

// ---------------------------------------------------------------------------
// execute_step
// ---------------------------------------------------------------------------

describe("execute_step", () => {
  it("goes to record_observation when Actor proposes an approved tool call", async () => {
    queueActorCritic([
      {
        actor: {
          kind: "tool_call",
          toolCall: {
            name: "read_file",
            args: { filePath: "DOES_NOT_EXIST.md" },
          },
        },
        critic: {
          verdict: "PASS",
          confidence: 0.9,
          findings: [{ checkId: "progress", passed: true }],
        },
      },
    ]);
    const outcome = await nodes[NODE_EXECUTE_STEP].run(baseCtx());
    expect(outcome.kind).toBe("goto");
    if (outcome.kind !== "goto") throw new Error("unreachable");
    expect(outcome.next).toBe(NODE_RECORD_OBSERVATION);
    expect(outcome.contextPatch?.iterations).toBe(1);
    expect(outcome.contextPatch?.lastObservation).toBeDefined();
  });

  it("goes to evaluate_completion when Actor proposes an approved final_message", async () => {
    queueActorCritic([
      {
        actor: { kind: "final_message", finalMessage: "All DONE." },
        critic: {
          verdict: "PASS",
          confidence: 0.9,
          findings: [{ checkId: "progress", passed: true }],
        },
      },
    ]);
    const outcome = await nodes[NODE_EXECUTE_STEP].run(baseCtx());
    expect(outcome.kind).toBe("goto");
    if (outcome.kind !== "goto") throw new Error("unreachable");
    expect(outcome.next).toBe(NODE_EVALUATE_COMPLETION);
  });

  it("routes to commit_or_loop with error when provider throws", async () => {
    // Empty queue -> ScriptedRoleProvider throws "queue exhausted".
    queueActorCritic([]);
    const outcome = await nodes[NODE_EXECUTE_STEP].run(baseCtx());
    expect(outcome.kind).toBe("goto");
    if (outcome.kind !== "goto") throw new Error("unreachable");
    expect(outcome.next).toBe(NODE_COMMIT_OR_LOOP);
    expect(
      (outcome.contextPatch?.error as { message: string }).message,
    ).toContain("queue exhausted");
  });

  // Pass 12 — step exhaustion triggers the same needs_human path as
  // plan exhaustion. Interrupt + Issue.status="needs_human".
  it("interrupts with needs_human when Critic reworks the step three times (pass 12)", async () => {
    queueActorCritic([
      {
        actor: { kind: "final_message", finalMessage: "try 1" },
        critic: {
          verdict: "REWORK",
          confidence: 0.2,
          critique: "nope",
          findings: [{ checkId: "progress", passed: false }],
        },
      },
      {
        actor: { kind: "final_message", finalMessage: "try 2" },
        critic: {
          verdict: "REWORK",
          confidence: 0.2,
          critique: "nope",
          findings: [{ checkId: "progress", passed: false }],
        },
      },
      {
        actor: { kind: "final_message", finalMessage: "try 3" },
        critic: {
          verdict: "REWORK",
          confidence: 0.2,
          critique: "nope",
          findings: [{ checkId: "progress", passed: false }],
        },
      },
    ]);
    const outcome = await nodes[NODE_EXECUTE_STEP].run(baseCtx());
    expect(outcome.kind).toBe("interrupt");
    if (outcome.kind !== "interrupt") throw new Error("unreachable");
    expect(outcome.reason).toBe(INTERRUPT_REASON_ACTOR_CRITIC_EXHAUSTED);
    expect(issueUpdateMock).toHaveBeenCalledWith({
      where: { id: "task-abc" },
      data: { status: "needs_human" },
    });
    expect((outcome.contextPatch?.error as { message: string }).message).toBe(
      "step_rejected_after_3_cycles",
    );
  });
});

// ---------------------------------------------------------------------------
// record_observation
// ---------------------------------------------------------------------------

describe("record_observation", () => {
  it("calls shareDiscovery and loops back to execute_step", async () => {
    const ctx = baseCtx({ lastObservation: { output: "ok" } });
    const outcome = await nodes[NODE_RECORD_OBSERVATION].run(ctx);
    expect(shareDiscoveryMock).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe("goto");
    if (outcome.kind !== "goto") throw new Error("unreachable");
    expect(outcome.next).toBe(NODE_EXECUTE_STEP);
  });
});

// ---------------------------------------------------------------------------
// evaluate_completion
// ---------------------------------------------------------------------------

describe("evaluate_completion", () => {
  // Pass 12 — the DONE-token heuristic is gone. Completion is now decided
  // by running the Actor/Critic loop on the current chat history against
  // the category-appropriate rubric.
  it("routes to commit_or_loop with completionReason=critic_approved when Actor emits a final_message approved by Critic", async () => {
    queueActorCritic([
      {
        actor: { kind: "final_message", finalMessage: "all done" },
        critic: {
          verdict: "PASS",
          confidence: 0.95,
          findings: [{ checkId: "progress", passed: true }],
        },
      },
    ]);
    const ctx = baseCtx({
      chatHistory: [{ role: "model", content: "work complete" }],
      iterations: 2,
    });
    const outcome = await nodes[NODE_EVALUATE_COMPLETION].run(ctx);
    expect(outcome.kind).toBe("goto");
    if (outcome.kind !== "goto") throw new Error("unreachable");
    expect(outcome.next).toBe(NODE_COMMIT_OR_LOOP);
    expect(outcome.contextPatch?.completionReason).toBe("critic_approved");
  });

  it("routes back to execute_step when Actor proposes an approved tool_call", async () => {
    queueActorCritic([
      {
        actor: {
          kind: "tool_call",
          toolCall: { name: "read_file", args: { filePath: "x.md" } },
        },
        critic: {
          verdict: "PASS",
          confidence: 0.9,
          findings: [{ checkId: "progress", passed: true }],
        },
      },
    ]);
    const ctx = baseCtx({
      chatHistory: [{ role: "model", content: "keep going" }],
      iterations: 1,
      maxIterations: 5,
    });
    const outcome = await nodes[NODE_EVALUATE_COMPLETION].run(ctx);
    expect(outcome.kind).toBe("goto");
    if (outcome.kind !== "goto") throw new Error("unreachable");
    expect(outcome.next).toBe(NODE_EXECUTE_STEP);
  });

  it("short-circuits to commit_or_loop on max iterations without consuming provider calls", async () => {
    // Empty queue — if the node were to invoke the Actor/Critic loop the
    // ScriptedRoleProvider would throw "queue exhausted". Asserting the
    // node routes cleanly proves the iteration-budget short-circuit.
    queueActorCritic([]);
    const ctx = baseCtx({
      chatHistory: [{ role: "model", content: "no terminator" }],
      iterations: 5,
      maxIterations: 5,
    });
    const outcome = await nodes[NODE_EVALUATE_COMPLETION].run(ctx);
    expect(outcome.kind).toBe("goto");
    if (outcome.kind !== "goto") throw new Error("unreachable");
    expect(outcome.next).toBe(NODE_COMMIT_OR_LOOP);
    expect(outcome.contextPatch?.completionReason).toBe("max_iterations");
  });

  it("interrupts with needs_human when Critic reworks the final_message three times (pass 12)", async () => {
    queueActorCritic([
      {
        actor: { kind: "final_message", finalMessage: "done?" },
        critic: {
          verdict: "REWORK",
          confidence: 0.1,
          critique: "no",
          findings: [{ checkId: "progress", passed: false }],
        },
      },
      {
        actor: { kind: "final_message", finalMessage: "done??" },
        critic: {
          verdict: "REWORK",
          confidence: 0.1,
          critique: "no",
          findings: [{ checkId: "progress", passed: false }],
        },
      },
      {
        actor: { kind: "final_message", finalMessage: "done???" },
        critic: {
          verdict: "REWORK",
          confidence: 0.1,
          critique: "no",
          findings: [{ checkId: "progress", passed: false }],
        },
      },
    ]);
    const ctx = baseCtx({
      chatHistory: [{ role: "model", content: "ambiguous" }],
      iterations: 2,
    });
    const outcome = await nodes[NODE_EVALUATE_COMPLETION].run(ctx);
    expect(outcome.kind).toBe("interrupt");
    if (outcome.kind !== "interrupt") throw new Error("unreachable");
    expect(outcome.reason).toBe(INTERRUPT_REASON_ACTOR_CRITIC_EXHAUSTED);
    expect(issueUpdateMock).toHaveBeenCalledWith({
      where: { id: "task-abc" },
      data: { status: "needs_human" },
    });
  });
});

// ---------------------------------------------------------------------------
// commit_or_loop
// ---------------------------------------------------------------------------

describe("commit_or_loop", () => {
  it("emits complete on success path", async () => {
    const ctx = baseCtx({
      chatHistory: [{ role: "model", content: "DONE" }],
      completionReason: "done_token",
    });
    const outcome = await nodes[NODE_COMMIT_OR_LOOP].run(ctx);
    expect(outcome.kind).toBe("complete");
    expect(markTaskCompleteMock).toHaveBeenCalledWith("task-abc", "DONE");
  });

  it("emits error on failure path", async () => {
    const ctx = baseCtx({
      error: { message: "boom" },
    });
    const outcome = await nodes[NODE_COMMIT_OR_LOOP].run(ctx);
    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") throw new Error("unreachable");
    expect(outcome.error.message).toBe("boom");
    expect(markTaskCompleteMock).toHaveBeenCalledWith(
      "task-abc",
      "FAILED: boom",
    );
  });
});
