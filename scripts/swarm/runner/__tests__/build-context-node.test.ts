// Pass 15 — unit tests for the rewritten `build_context` node.
//
// Covers:
//   - Happy path: dynamic builder returns a system prompt + meta; the node
//     writes both into the context patch and routes to `explore`.
//   - Fallback path: dynamic builder throws; the node logs, renders the
//     static prompt via `buildStaticContext`, and still routes to `explore`.
//
// Run explicitly — lives under scripts/swarm/runner/__tests__/ which is
// excluded from root `npm test`. Invoke via:
//   npx jest --config jest.config.ts \
//     --roots <rootDir>/scripts/swarm/runner/__tests__/ \
//     --testRegex 'build-context-node\.test\.ts$'

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
      .mockResolvedValue({ content: "ok" }),
  })),
}));

jest.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  __esModule: true,
  StdioClientTransport: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("../../shared-memory", () => ({
  __esModule: true,
  shareDiscovery: jest.fn().mockResolvedValue(undefined),
  markTaskComplete: jest.fn().mockResolvedValue(undefined),
  getSharedContext: jest
    .fn<(t: string) => Promise<string[]>>()
    .mockResolvedValue(["[discovery] prior trace"]),
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

// Mock the context-builder so we can script both success and failure.
type BuildContextFn = (
  input: unknown,
  deps: unknown,
) => Promise<{
  systemPrompt: string;
  tokenEstimate: number;
  chunks: unknown[];
  meta: { memoryHits: number; symbolHits: number; tokenBudget: number };
}>;

const buildDynamicContextMock = jest.fn<BuildContextFn>();

jest.mock("@/lib/orchestration/context-builder", () => {
  const actual = jest.requireActual(
    "@/lib/orchestration/context-builder",
  ) as Record<string, unknown>;
  return {
    __esModule: true,
    ...actual,
    buildDynamicContext: buildDynamicContextMock,
  };
});

// Mock deps so `getRunnerDeps` doesn't boot the real pgvector singleton.
jest.mock("../deps", () => ({
  __esModule: true,
  getRunnerDeps: jest.fn(() => ({
    memory: {},
    codeIndex: {},
    embeddings: { name: "test-stub", dim: 768 },
  })),
  setRunnerDeps: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import {
  nodes,
  NODE_BUILD_CONTEXT,
  NODE_EXPLORE,
  type RunnerContext,
} from "../nodes";

function baseCtx(over: Partial<RunnerContext> = {}): RunnerContext {
  return {
    taskId: "task-build-ctx",
    agentCategory: "1_qa",
    modelId: "gemini-3.1-pro",
    worktreePath: "/workspace",
    instruction: "investigate the repo and plan",
    chatHistory: [],
    iterations: 0,
    maxIterations: 5,
    explorationBudget: 8,
    explorationHistory: [],
    ...over,
  };
}

beforeEach(() => {
  buildDynamicContextMock.mockReset();
});

describe("build_context node — happy path (dynamic builder)", () => {
  it("writes systemPrompt + contextBuildMeta and routes to explore", async () => {
    buildDynamicContextMock.mockResolvedValueOnce({
      systemPrompt: "DYNAMIC_SYSTEM_PROMPT_MARKER",
      tokenEstimate: 42,
      chunks: [],
      meta: { memoryHits: 3, symbolHits: 2, tokenBudget: 20_000 },
    });

    const outcome = await nodes[NODE_BUILD_CONTEXT].run(baseCtx());
    expect(outcome.kind).toBe("goto");
    if (outcome.kind !== "goto") throw new Error("unreachable");
    expect(outcome.next).toBe(NODE_EXPLORE);
    expect(outcome.contextPatch?.systemPrompt).toBe(
      "DYNAMIC_SYSTEM_PROMPT_MARKER",
    );
    expect(outcome.contextPatch?.contextBuildMeta).toEqual({
      memoryHits: 3,
      symbolHits: 2,
      tokenBudget: 20_000,
    });
    expect(buildDynamicContextMock).toHaveBeenCalledTimes(1);
  });
});

describe("build_context node — fallback path (builder throws)", () => {
  it("logs the failure, renders the static prompt, and still routes to explore", async () => {
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    buildDynamicContextMock.mockRejectedValueOnce(
      new Error("embeddings unreachable"),
    );

    const outcome = await nodes[NODE_BUILD_CONTEXT].run(baseCtx());
    expect(outcome.kind).toBe("goto");
    if (outcome.kind !== "goto") throw new Error("unreachable");
    expect(outcome.next).toBe(NODE_EXPLORE);

    const prompt = outcome.contextPatch?.systemPrompt;
    expect(typeof prompt).toBe("string");
    expect(prompt as string).toContain("autonomous AI swarm worker");
    // Static fallback does not emit contextBuildMeta.
    expect(outcome.contextPatch?.contextBuildMeta).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
