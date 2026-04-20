// Pass 14 — Exploration budget / test-time interaction scaling (directive #2).
//
// The Actor gets a read-only "exploration" phase BEFORE committing to a plan.
// During this phase it can call up to N read-only tools (Grep / Read / Glob /
// MCP `get_*` / `list_*` / `read_*` / …) to reduce uncertainty. When the
// Actor signals it has enough information, control hands off to the
// `propose_plan` node. If the budget is exhausted, the runner proceeds
// regardless.
//
// This module provides:
//   - `ExplorationContext`  — what the Actor sees during a turn.
//   - `ExplorationStep`     — one tool call + result.
//   - `ExplorationOutcome`  — Actor decision for the current turn.
//   - `proposeExplorationStep()` — the LLM call that returns an outcome.
//   - `filterReadOnlyTools()`    — deterministic read-only tool allow-list.
//
// Design invariants:
//   - `filterReadOnlyTools` is pure — no I/O, no side effects, no globals.
//     Same input yields same output. The allow-list pattern is documented on
//     the function itself so future tool additions can be audited statically.
//   - The runtime never trusts the Actor to pick a non-read-only tool.
//     Even if the LLM returns `{kind: "continue", nextStep: {tool: "Write"}}`,
//     the node body is responsible for re-checking against the filtered
//     catalog and rejecting the step.
//   - The module has zero dependency on `scripts/swarm/*`. `lib/` must not
//     take a dependency on `scripts/`. The provider adapter type is mirrored
//     structurally below; any concrete `LLMProviderAdapter` instance from
//     `scripts/swarm/providers.ts` is structurally assignable.

/**
 * Structural mirror of `scripts/swarm/providers.ts::LLMProviderAdapter`.
 * Only the subset needed by `proposeExplorationStep` is declared. Keeping the
 * shape here prevents a `lib → scripts` dependency edge.
 */
export interface LLMProviderAdapter {
  readonly name: string;
  generate(request: {
    systemPrompt: string;
    userPrompt: string;
    modelId: string;
    maxTokens?: number;
    temperature?: number;
    timeoutSeconds?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{
    text: string;
    provider: string;
    modelId: string;
    finishReason?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    raw?: unknown;
  }>;
  healthcheck(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Public shapes (re-exported downstream).
// ---------------------------------------------------------------------------

export interface ReadOnlyTool {
  name: string;
  description: string;
  schema?: unknown;
}

export interface ExplorationStep {
  tool: string;
  args: unknown;
  result: unknown;
  tokensUsed?: number;
  timestamp: string; // ISO-8601
}

export interface ExplorationContext {
  taskId: string;
  taskInstruction: string;
  agentCategory: string;
  allowedTools: ReadonlyArray<ReadOnlyTool>;
  history: ReadonlyArray<ExplorationStep>;
  /** Remaining tool calls the Actor may make in this exploration run. */
  budget: number;
}

export type ExplorationOutcome =
  | {
      kind: "continue";
      nextStep: { tool: string; args: unknown };
      /** 0..1 — optional; the model's stated confidence that more exploration
       *  will help before committing to a plan. */
      confidence?: number;
    }
  | {
      kind: "stop";
      reason?: string;
      /** 0..1 — optional; the model's stated confidence that a plan can now
       *  be drafted from the accumulated exploration history. */
      confidence?: number;
    };

// ---------------------------------------------------------------------------
// Read-only tool allow-list.
// ---------------------------------------------------------------------------

/**
 * ALLOW-LIST PATTERN (pass 14):
 *
 * A tool name is considered "read-only" and admissible during the exploration
 * phase iff ANY of the following is true:
 *
 *   1. The name starts with one of these prefixes (case-insensitive):
 *        `get_` `list_` `read_` `grep_` `search_` `query_`
 *      Chosen because these are the conventional read-side prefixes across
 *      the MCP servers used by this repo (ast-analyzer, gcp-trace, memory,
 *      docker-mcp-gateway) and the wider MCP ecosystem.
 *
 *   2. The name is one of the Claude Code built-ins that are read-only:
 *        `Read` `Grep` `Glob`
 *      (Bash is intentionally NOT included; it can mutate. Write / Edit are
 *      also excluded for the same reason.)
 *
 *   3. The name contains one of these substrings (case-insensitive):
 *        `_read`  `_get`  `_list`
 *      e.g. `mcp__ast-analyzer-mcp__get_file_exports`,
 *           `mcp__claude_ai_Google_Drive__list_recent_files`,
 *           `mcp__docker-mcp-gateway__pull_request_read`.
 *
 * Anything NOT matching at least one of these patterns is rejected, including
 * anything with `create_`, `delete_`, `update_`, `write_`, `remove_`, `set_`,
 * `call_`, `exec_`, `run_`, `build_`, `stop_`, `start_`, `push_`, `merge_`,
 * `fork_`, `add_`, `restart` — even if such a tool also happens to include
 * `_read` as an inner substring (we check the positive patterns only; this
 * list is merely descriptive of what the allow-list filters out).
 *
 * This function is pure and deterministic: no globals, no I/O, no date calls.
 */
export function filterReadOnlyTools(
  catalog: Array<{ name: string; description?: string; schema?: unknown }>,
): Array<ReadOnlyTool> {
  const out: ReadOnlyTool[] = [];
  for (const t of catalog) {
    if (!t || typeof t.name !== "string" || t.name.length === 0) continue;
    if (isReadOnlyName(t.name)) {
      out.push({
        name: t.name,
        description:
          typeof t.description === "string" && t.description.length > 0
            ? t.description
            : "(no description)",
        schema: t.schema,
      });
    }
  }
  return out;
}

const READ_ONLY_PREFIXES = [
  "get_",
  "list_",
  "read_",
  "grep_",
  "search_",
  "query_",
] as const;

const READ_ONLY_EXACT = new Set<string>(["Read", "Grep", "Glob"]);

const READ_ONLY_SUBSTRINGS = ["_read", "_get", "_list"] as const;

function isReadOnlyName(name: string): boolean {
  if (READ_ONLY_EXACT.has(name)) return true;
  const lower = name.toLowerCase();
  for (const p of READ_ONLY_PREFIXES) {
    if (lower.startsWith(p)) return true;
  }
  for (const s of READ_ONLY_SUBSTRINGS) {
    if (lower.includes(s)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Prompt rendering for the exploration turn.
// ---------------------------------------------------------------------------

function renderExplorationPrompt(ctx: ExplorationContext): string {
  const lines: string[] = [];
  lines.push("You are in the exploration phase before committing to a plan.");
  lines.push(
    "Choose one read-only tool to reduce uncertainty, OR stop if you have enough information.",
  );
  lines.push("");
  lines.push(`Task: ${ctx.taskId}`);
  lines.push(`Category: ${ctx.agentCategory}`);
  lines.push(`Instruction:\n${ctx.taskInstruction}`);
  lines.push("");
  lines.push(`Remaining exploration budget: ${ctx.budget} tool calls.`);
  lines.push("");
  lines.push(`Read-only tools available (${ctx.allowedTools.length}):`);
  for (const t of ctx.allowedTools) {
    lines.push(`- ${t.name}: ${t.description}`);
  }
  lines.push("");
  if (ctx.history.length > 0) {
    lines.push(`Exploration so far (${ctx.history.length} step(s)):`);
    for (const s of ctx.history) {
      const resultStr =
        typeof s.result === "string"
          ? s.result
          : JSON.stringify(s.result ?? "");
      lines.push(
        `- [${s.timestamp}] ${s.tool}(${JSON.stringify(s.args)}) -> ${resultStr.slice(0, 400)}`,
      );
    }
    lines.push("");
  }
  lines.push(
    "Respond with exactly one JSON object shaped either " +
      '{"kind":"continue","nextStep":{"tool":"<name>","args":<object>},"confidence"?:<0..1>} ' +
      'OR {"kind":"stop","reason"?:"<text>","confidence"?:<0..1>}.',
  );
  return lines.join("\n");
}

function parseExplorationOutcome(
  text: string,
  allowedToolNames: ReadonlySet<string>,
): ExplorationOutcome {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    // Non-JSON response → treat as stop so we don't loop on garbage.
    return { kind: "stop", reason: "unparseable_outcome" };
  }
  if (typeof parsed !== "object" || parsed === null || !("kind" in parsed)) {
    return { kind: "stop", reason: "missing_kind_field" };
  }
  const obj = parsed as Record<string, unknown>;
  const kind = obj.kind;
  if (kind === "stop") {
    return {
      kind: "stop",
      reason: typeof obj.reason === "string" ? obj.reason : undefined,
      confidence:
        typeof obj.confidence === "number" ? obj.confidence : undefined,
    };
  }
  if (kind === "continue") {
    const nextStep = obj.nextStep as
      | { tool?: unknown; args?: unknown }
      | undefined;
    if (
      !nextStep ||
      typeof nextStep !== "object" ||
      typeof (nextStep as { tool?: unknown }).tool !== "string"
    ) {
      return { kind: "stop", reason: "missing_next_step" };
    }
    const toolName = (nextStep as { tool: string }).tool;
    if (!allowedToolNames.has(toolName)) {
      // The model picked a non-read-only tool. Refuse and stop cleanly —
      // the node body logs this as an exploration-abort.
      return { kind: "stop", reason: `tool_not_allowed:${toolName}` };
    }
    return {
      kind: "continue",
      nextStep: {
        tool: toolName,
        args: (nextStep as { args?: unknown }).args ?? {},
      },
      confidence:
        typeof obj.confidence === "number" ? obj.confidence : undefined,
    };
  }
  return { kind: "stop", reason: "unknown_kind" };
}

/**
 * Ask the LLM to decide whether to continue exploring or stop.
 *
 * The caller is responsible for:
 *   - enforcing the budget (this function does not decrement);
 *   - actually executing the `nextStep` tool call;
 *   - appending the resulting `ExplorationStep` to `ctx.history` before the
 *     next invocation.
 */
export async function proposeExplorationStep(
  ctx: ExplorationContext,
  provider: LLMProviderAdapter,
  modelId: string,
): Promise<ExplorationOutcome> {
  const allowed = new Set(ctx.allowedTools.map((t) => t.name));
  const userPrompt = renderExplorationPrompt(ctx);
  const response = await provider.generate({
    systemPrompt:
      "You are the exploration planner for a read-only pre-plan phase. Respond with one JSON object only.",
    userPrompt,
    modelId,
    metadata: { role: "explorer", taskId: ctx.taskId },
  });
  return parseExplorationOutcome(response.text, allowed);
}
