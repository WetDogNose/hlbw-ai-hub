// Pass 14 — unit tests for `lib/orchestration/explorer.ts`.
//
// Covers:
//   - filterReadOnlyTools keeps only tools matching the allow-list pattern
//     (prefix / exact / substring) and drops mutating tools.
//   - proposeExplorationStep round-trips a scripted provider's "continue"
//     outcome into a valid `ExplorationOutcome.continue`.
//   - proposeExplorationStep routes a "stop" outcome.
//   - proposeExplorationStep coerces a non-allowed tool name into a stop
//     with a "tool_not_allowed" reason (runtime guard against LLM drift).

import { describe, expect, it, jest } from "@jest/globals";

import {
  filterReadOnlyTools,
  proposeExplorationStep,
  type ExplorationContext,
  type LLMProviderAdapter,
} from "../explorer";

describe("filterReadOnlyTools", () => {
  it("keeps only read-only tools from a mixed catalog", () => {
    const input = [
      { name: "get_status", description: "read status" },
      { name: "create_user", description: "make a user" },
      { name: "list_tasks", description: "enumerate tasks" },
      { name: "delete_row", description: "destructive" },
      { name: "Grep", description: "search content" },
      { name: "Write", description: "write a file" },
    ];
    const out = filterReadOnlyTools(input)
      .map((t) => t.name)
      .sort();
    expect(out).toEqual(["Grep", "get_status", "list_tasks"].sort());
  });

  it("admits Claude-Code built-ins (Read / Grep / Glob) exactly", () => {
    const out = filterReadOnlyTools([
      { name: "Read" },
      { name: "Grep" },
      { name: "Glob" },
      { name: "Write" },
      { name: "Edit" },
      { name: "Bash" },
    ]).map((t) => t.name);
    expect(out.sort()).toEqual(["Glob", "Grep", "Read"].sort());
  });

  it("admits MCP-style names containing _read / _get / _list", () => {
    const out = filterReadOnlyTools([
      { name: "mcp__docker-mcp-gateway__pull_request_read" },
      { name: "mcp__ast__get_file_exports" },
      { name: "mcp__drive__list_recent_files" },
      { name: "mcp__drive__create_file" },
      { name: "mcp__ha__call_service" },
    ]).map((t) => t.name);
    expect(out.sort()).toEqual(
      [
        "mcp__docker-mcp-gateway__pull_request_read",
        "mcp__ast__get_file_exports",
        "mcp__drive__list_recent_files",
      ].sort(),
    );
  });

  it('defaults missing descriptions to "(no description)"', () => {
    const out = filterReadOnlyTools([{ name: "get_thing" }]);
    expect(out[0]?.description).toBe("(no description)");
  });

  it("ignores entries with a missing or empty name", () => {
    const out = filterReadOnlyTools([
      { name: "" },
      { name: "get_x" },
      // @ts-expect-error intentionally malformed
      {},
    ]);
    expect(out.map((t) => t.name)).toEqual(["get_x"]);
  });

  it("is deterministic — identical inputs yield identical outputs", () => {
    const input = [{ name: "get_a" }, { name: "list_b" }, { name: "write_c" }];
    const a = filterReadOnlyTools(input);
    const b = filterReadOnlyTools(input);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// proposeExplorationStep
// ---------------------------------------------------------------------------

class ScriptedProvider implements LLMProviderAdapter {
  readonly name = "scripted";
  public scripted: string[] = [];
  public calls: Array<{ systemPrompt: string; userPrompt: string }> = [];
  async generate(request: {
    systemPrompt: string;
    userPrompt: string;
    modelId: string;
  }): Promise<{
    text: string;
    provider: string;
    modelId: string;
    finishReason?: string;
  }> {
    this.calls.push({
      systemPrompt: request.systemPrompt,
      userPrompt: request.userPrompt,
    });
    const text = this.scripted.shift();
    if (text === undefined) {
      throw new Error("ScriptedProvider: queue exhausted");
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

function buildCtx(
  overrides: Partial<ExplorationContext> = {},
): ExplorationContext {
  return {
    taskId: "task-xyz",
    taskInstruction: "find the config file",
    agentCategory: "1_qa",
    allowedTools: [
      { name: "Read", description: "read a file" },
      { name: "Grep", description: "search content" },
      { name: "get_status", description: "read status" },
    ],
    history: [],
    budget: 5,
    ...overrides,
  };
}

describe("proposeExplorationStep", () => {
  it('round-trips a "continue" outcome from the scripted provider', async () => {
    const provider = new ScriptedProvider();
    provider.scripted.push(
      JSON.stringify({
        kind: "continue",
        nextStep: { tool: "Read", args: { filePath: "config.json" } },
        confidence: 0.7,
      }),
    );
    const result = await proposeExplorationStep(
      buildCtx(),
      provider,
      "stub-model",
    );
    expect(result.kind).toBe("continue");
    if (result.kind !== "continue") throw new Error("unreachable");
    expect(result.nextStep).toEqual({
      tool: "Read",
      args: { filePath: "config.json" },
    });
    expect(result.confidence).toBe(0.7);
    expect(provider.calls.length).toBe(1);
    expect(provider.calls[0]?.userPrompt).toContain("find the config file");
  });

  it('routes a "stop" outcome cleanly', async () => {
    const provider = new ScriptedProvider();
    provider.scripted.push(
      JSON.stringify({ kind: "stop", reason: "no_questions" }),
    );
    const result = await proposeExplorationStep(
      buildCtx(),
      provider,
      "stub-model",
    );
    expect(result.kind).toBe("stop");
    if (result.kind !== "stop") throw new Error("unreachable");
    expect(result.reason).toBe("no_questions");
  });

  it("rejects a non-allowed tool with tool_not_allowed stop", async () => {
    const provider = new ScriptedProvider();
    provider.scripted.push(
      JSON.stringify({
        kind: "continue",
        nextStep: { tool: "Write", args: { filePath: "oops" } },
      }),
    );
    const result = await proposeExplorationStep(
      buildCtx(),
      provider,
      "stub-model",
    );
    expect(result.kind).toBe("stop");
    if (result.kind !== "stop") throw new Error("unreachable");
    expect(result.reason).toMatch(/^tool_not_allowed:Write$/);
  });

  it("stops on unparseable provider output", async () => {
    const provider = new ScriptedProvider();
    provider.scripted.push("not valid JSON at all {{{");
    const result = await proposeExplorationStep(
      buildCtx(),
      provider,
      "stub-model",
    );
    expect(result.kind).toBe("stop");
    if (result.kind !== "stop") throw new Error("unreachable");
    expect(result.reason).toBe("unparseable_outcome");
  });
});
