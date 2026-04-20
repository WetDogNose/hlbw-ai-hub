// Pass 9 — Node registry for the agent-runner graph.
//
// Converts the monolithic Gemini chat loop previously in `agent-runner.ts`
// into a discrete sequence of Nodes executed by the StateGraph runtime from
// pass 8. Topology only — no context-building changes (pass 15) and no
// role-separation changes (pass 11) yet.
//
// Node sequence (see PLAN.md §3 Pass 9):
//   init_mcp -> build_context -> propose_plan -> execute_step
//     -> record_observation -> execute_step ...
//     -> evaluate_completion -> (goto execute_step | complete)
//   execute_step on error -> commit_or_loop (terminal error path)
//   evaluate_completion complete -> commit_or_loop (terminal success path)
//
// Each node reads the serialized `GraphContext` we treat as a
// `RunnerContext` (shape below) and returns a `NodeOutcome` with an
// optional `contextPatch`. Side effects (Gemini/MCP/shared-memory calls)
// live inside node bodies — control flow lives in the graph.

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerativeModel,
} from "@google/generative-ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  defineGraph,
  type GraphContext,
  type Node,
  type NodeName,
  type NodeOutcome,
  type StateGraph,
} from "@/lib/orchestration/graph";

import {
  shareDiscovery,
  markTaskComplete,
  getSharedContext,
} from "../shared-memory";
import { getProvider } from "../providers";
import { runActorCriticLoop } from "../roles/orchestrator";
import type { ActorInput, ActorProposal } from "../roles/actor";
import { loadRubric } from "@/lib/orchestration/rubrics";
import prisma from "@/lib/prisma";
import { TaskStatus } from "../types";
import { getTracer } from "../tracing";
import {
  filterReadOnlyTools,
  proposeExplorationStep,
  type ExplorationContext,
  type ExplorationStep,
} from "@/lib/orchestration/explorer";
import {
  buildDynamicContext,
  type BuildContextInput,
  type BuildContextOutput,
} from "@/lib/orchestration/context-builder";
import { getRunnerDeps } from "./deps";
import { SPAN_ATTR, SPAN_ROLE } from "@/lib/orchestration/tracing/attrs";
import {
  fetchRecentTraceSummaries,
  stringifyTraceSummary,
} from "@/lib/orchestration/tracing/summaries";

/** Pass 12 — reason written to `task_graph_state.interruptReason` and the
 * Issue failure message when the reflection loop exhausts its cycles. */
export const INTERRUPT_REASON_ACTOR_CRITIC_EXHAUSTED = "actor_critic_exhausted";

// ---------------------------------------------------------------------------
// RunnerContext — canonical shape of `GraphContext` for this graph.
// ---------------------------------------------------------------------------

export interface RunnerChatMessage {
  role: "user" | "model" | "tool";
  content: string;
}

// Pass 10 — optional Worker identity folded into the graph context so the
// JSON `state.json` worker snapshot becomes advisory only. Not a Prisma
// model; lives inside `task_graph_state.context` JSON.
export interface RunnerWorker {
  provider: string;
  modelId: string;
  containerId: string;
  startedAt: string;
}

export interface RunnerContext extends GraphContext {
  taskId: string;
  agentCategory: string;
  modelId: string;
  worktreePath: string;
  instruction: string;
  mcpTools?: unknown[];
  systemPrompt?: string;
  plan?: string;
  chatHistory: RunnerChatMessage[];
  lastObservation?: unknown;
  iterations: number;
  maxIterations: number;
  completionReason?: string;
  error?: { message: string; stack?: string };
  worker?: RunnerWorker;
  // Pass 14 — read-only exploration budget drained by the `explore` node.
  explorationBudget: number;
  explorationHistory: ExplorationStep[];
  /** Terse human-readable summary the Actor sees via `ActorInput.explorationNotes`
   *  once exploration ends. Absent until the explore node emits a stop. */
  explorationNotes?: string;
  // Pass 15 — metadata from the dynamic context builder for debugging /
  // observability. Populated by build_context; undefined on the static
  // fallback path.
  contextBuildMeta?: BuildContextOutput["meta"];
}

function asRunnerContext(ctx: GraphContext): RunnerContext {
  // The runtime stores whatever shape we hand it; we re-narrow on read.
  const chatHistory = Array.isArray(ctx.chatHistory)
    ? (ctx.chatHistory as RunnerChatMessage[])
    : [];
  const explorationHistory = Array.isArray(ctx.explorationHistory)
    ? (ctx.explorationHistory as ExplorationStep[])
    : [];
  // Pass 14 — default budget (env override via AGENT_EXPLORATION_BUDGET).
  const envBudget = Number(process.env.AGENT_EXPLORATION_BUDGET);
  const defaultBudget =
    Number.isFinite(envBudget) && envBudget >= 0 ? envBudget : 8;
  const explorationBudget =
    typeof ctx.explorationBudget === "number"
      ? ctx.explorationBudget
      : defaultBudget;
  return {
    taskId: String(ctx.taskId ?? ""),
    agentCategory: String(ctx.agentCategory ?? "default"),
    modelId: String(ctx.modelId ?? "gemini-3.1-pro"),
    worktreePath: String(ctx.worktreePath ?? "/workspace"),
    instruction: String(ctx.instruction ?? ""),
    mcpTools: Array.isArray(ctx.mcpTools) ? ctx.mcpTools : undefined,
    systemPrompt:
      typeof ctx.systemPrompt === "string" ? ctx.systemPrompt : undefined,
    plan: typeof ctx.plan === "string" ? ctx.plan : undefined,
    chatHistory,
    lastObservation: ctx.lastObservation,
    iterations: typeof ctx.iterations === "number" ? ctx.iterations : 0,
    maxIterations:
      typeof ctx.maxIterations === "number" ? ctx.maxIterations : 30,
    completionReason:
      typeof ctx.completionReason === "string"
        ? ctx.completionReason
        : undefined,
    error: (ctx.error as RunnerContext["error"]) ?? undefined,
    worker: (ctx.worker as RunnerWorker | undefined) ?? undefined,
    explorationBudget,
    explorationHistory,
    explorationNotes:
      typeof ctx.explorationNotes === "string"
        ? ctx.explorationNotes
        : undefined,
    contextBuildMeta:
      ctx.contextBuildMeta && typeof ctx.contextBuildMeta === "object"
        ? (ctx.contextBuildMeta as BuildContextOutput["meta"])
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Module-level MCP + Gemini state (lazy-initialised by nodes).
// Exported for test injection.
// ---------------------------------------------------------------------------

export interface RunnerRuntime {
  mcpClients: Record<string, Client>;
  mcpToolDefinitions: unknown[];
  mcpInitialized: boolean;
  genAI: GoogleGenerativeAI | null;
  model: GenerativeModel | null;
  /** Name of the provider used by the Actor/Critic loop (pass 11). */
  roleProviderName: string;
  /** Model id used by the Actor/Critic loop (pass 11). */
  roleModelId: string;
}

export const runnerRuntime: RunnerRuntime = {
  mcpClients: {},
  mcpToolDefinitions: [],
  mcpInitialized: false,
  genAI: null,
  model: null,
  roleProviderName: "gemini",
  roleModelId: "gemini-3.1-pro",
};

export function translateWindowsPathToLinux(winPath: string): string {
  if (!winPath) return winPath;
  return winPath
    .replace(
      /[Cc]:[/\\]+[Uu]sers[/\\]+[^/\\]+[/\\]+repos[/\\]+hlbw-ai-hub/gi,
      "/workspace",
    )
    .replace(/[/\\]+/g, "/");
}

// ---------------------------------------------------------------------------
// MCP boot helper (extracted from the legacy agent-runner.ts body).
// ---------------------------------------------------------------------------

export async function initializeMCPServers(): Promise<{
  clients: Record<string, Client>;
  toolDefinitions: unknown[];
}> {
  const clients: Record<string, Client> = {};
  const toolDefinitions: unknown[] = [];

  const category = process.env.AGENT_CATEGORY || "default";
  let configPath = `/etc/mcp_configs/${category}/mcp_config.json`;
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
    configPath = `/etc/mcp_configs/category-${category.replace(
      "_",
      "-",
    )}/mcp_config.json`;
  }

  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
    console.warn(
      `[A2A][MCP] No config found at ${configPath}. Starting with base tools only.`,
    );
    return { clients, toolDefinitions };
  }

  let config: unknown;
  try {
    const configRaw = fs.readFileSync(configPath, "utf8");
    config = JSON.parse(configRaw);
  } catch (err) {
    console.error(`[A2A][MCP] Error reading config:`, (err as Error).message);
    return { clients, toolDefinitions };
  }

  const mcpServers = (config as { mcpServers?: Record<string, unknown> })
    .mcpServers;
  if (!mcpServers) return { clients, toolDefinitions };

  const initPromises = Object.entries(mcpServers).map(
    async ([serverName, rawOpts]) => {
      const serverOpts = rawOpts as {
        command: string;
        args?: string[];
        env?: Record<string, string>;
      };
      try {
        console.log(
          `[A2A][MCP] Booting persistent Transport for ${serverName}...`,
        );
        const command =
          serverOpts.command === "node.exe" ||
          serverOpts.command.includes("node")
            ? "node"
            : serverOpts.command;

        let args = serverOpts.args || [];
        if (command === "node") {
          args = args.map((arg) => translateWindowsPathToLinux(arg));
        }

        let client: Client | null = null;
        let connected = false;
        let lastErr: unknown;

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const currentTransport = new StdioClientTransport({
              command,
              args,
              env: {
                ...(process.env as Record<string, string>),
                ...(serverOpts.env ?? {}),
                NODE_PATH: "/workspace/node_modules",
              },
            });
            client = new Client(
              { name: "swarm-runner", version: "1.0.0" },
              { capabilities: {} },
            );
            await client.connect(currentTransport);
            connected = true;
            break;
          } catch (err) {
            lastErr = err;
            if (client) {
              try {
                await client.close();
              } catch (_e) {
                /* ignore */
              }
            }
            console.warn(
              `[A2A][MCP] Attempt ${attempt} failed to connect server ${serverName}: ${
                (err as Error).message
              }. Retrying...`,
            );
            await new Promise((r) => setTimeout(r, 2000));
          }
        }

        if (!connected || !client) throw lastErr;

        clients[serverName] = client;
        const { tools } = await client.listTools();
        console.log(
          `[A2A][MCP] ${serverName} connected with ${tools.length} tools.`,
        );
        for (const tool of tools) {
          toolDefinitions.push({
            name: tool.name.replace(/-/g, "_"),
            description:
              tool.description?.slice(0, 1024) || "No description provided",
            parameters: tool.inputSchema,
          });
        }
      } catch (error) {
        console.error(
          `[A2A][MCP] Failed to connect server ${serverName} after 3 attempts: ${
            (error as Error).message
          }`,
        );
      }
    },
  );

  await Promise.all(initPromises);
  return { clients, toolDefinitions };
}

// ---------------------------------------------------------------------------
// Base tool catalogue (unchanged from legacy agent-runner.ts).
// ---------------------------------------------------------------------------

export function baseToolCatalogue(): unknown[] {
  return [
    {
      name: "read_file",
      description: "Reads the content of a file",
      parameters: {
        type: SchemaType.OBJECT,
        properties: { filePath: { type: SchemaType.STRING } },
        required: ["filePath"],
      },
    },
    {
      name: "write_file",
      description: "Writes content to a file",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          filePath: { type: SchemaType.STRING },
          content: { type: SchemaType.STRING },
        },
        required: ["filePath", "content"],
      },
    },
    {
      name: "exec_command",
      description: "Executes a shell command (e.g. ls, grep, find)",
      parameters: {
        type: SchemaType.OBJECT,
        properties: { command: { type: SchemaType.STRING } },
        required: ["command"],
      },
    },
    {
      name: "ollama_generate",
      description: "Direct GPU inference for acceleration",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          model: { type: SchemaType.STRING },
          prompt: { type: SchemaType.STRING },
        },
        required: ["model", "prompt"],
      },
    },
    {
      name: "store_memory",
      description: "Stores a knowledge fragment into the shared swarm memory.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          type: {
            type: SchemaType.STRING,
            enum: ["swarm_discovery", "swarm_decision", "swarm_context"],
          },
          observations: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
        },
        required: ["name", "type", "observations"],
      },
    },
    {
      name: "create_memory_relation",
      description:
        "Creates a relationship between two existing memory fragments.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          source: { type: SchemaType.STRING },
          target: { type: SchemaType.STRING },
          relationType: { type: SchemaType.STRING },
        },
        required: ["source", "target", "relationType"],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Pass 12 — needs_human escalation helper.
//
// When `runActorCriticLoop` returns `exhausted`, the parent Issue flips to
// `needs_human` and the graph state flips to `interrupted` with reason
// `actor_critic_exhausted`. The node returns an `interrupt` outcome so the
// StateGraph runtime records the transition in its history.
// ---------------------------------------------------------------------------

export async function markIssueNeedsHuman(issueId: string): Promise<void> {
  try {
    await prisma.issue.update({
      where: { id: issueId },
      data: { status: TaskStatus.NeedsHuman },
    });
  } catch (err) {
    console.warn("[nodes] markIssueNeedsHuman failed:", (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Node names (exported for test readability).
// ---------------------------------------------------------------------------

export const NODE_INIT_MCP: NodeName = "init_mcp";
export const NODE_BUILD_CONTEXT: NodeName = "build_context";
// Pass 14 — read-only exploration node inserted between build_context and
// propose_plan. Self-loops via `NodeOutcome.goto` until the Actor signals
// stop or the budget is drained.
export const NODE_EXPLORE: NodeName = "explore";
export const NODE_PROPOSE_PLAN: NodeName = "propose_plan";
export const NODE_EXECUTE_STEP: NodeName = "execute_step";
export const NODE_RECORD_OBSERVATION: NodeName = "record_observation";
export const NODE_EVALUATE_COMPLETION: NodeName = "evaluate_completion";
export const NODE_COMMIT_OR_LOOP: NodeName = "commit_or_loop";

// ---------------------------------------------------------------------------
// Individual nodes.
// ---------------------------------------------------------------------------

const initMcpNode: Node = {
  name: NODE_INIT_MCP,
  async run(_ctx: GraphContext): Promise<NodeOutcome> {
    try {
      const { clients, toolDefinitions } = await initializeMCPServers();
      runnerRuntime.mcpClients = clients;
      runnerRuntime.mcpToolDefinitions = toolDefinitions;
      runnerRuntime.mcpInitialized = true;
      return {
        kind: "goto",
        next: NODE_BUILD_CONTEXT,
        contextPatch: { mcpTools: toolDefinitions },
      };
    } catch (err) {
      return {
        kind: "error",
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  },
};

/**
 * Pass 9 static prompt body — kept as a private helper for the fallback path
 * when the dynamic builder cannot reach its embedding provider or storage.
 * Never called on the happy path; the dynamic builder is the only production
 * route.
 */
async function buildStaticContext(rc: RunnerContext): Promise<string> {
  const sharedLines = await getSharedContext(rc.taskId);
  const toolCatalogue = [
    ...baseToolCatalogue(),
    ...(rc.mcpTools ?? runnerRuntime.mcpToolDefinitions),
  ];
  return (
    `You are an autonomous AI swarm worker inside worktree: ${rc.worktreePath}.\n` +
    `Task: ${rc.taskId}\n` +
    `Category: ${rc.agentCategory}\n\n` +
    `Shared context:\n${sharedLines.join("\n") || "(none)"}\n\n` +
    `Available tools:\n${JSON.stringify(toolCatalogue, null, 2)}\n\n` +
    `Execute your instruction and say DONE when finished.`
  );
}

// Pass 15 — default token budget. 1M context model has plenty of headroom;
// we cap at 20k chars/4 to keep the chat-history replay fast and the
// retrieved context dense.
const DEFAULT_CONTEXT_TOKEN_BUDGET = 20_000;

const buildContextNode: Node = {
  name: NODE_BUILD_CONTEXT,
  async run(ctx: GraphContext): Promise<NodeOutcome> {
    const rc = asRunnerContext(ctx);
    const toolCatalogue = [
      ...baseToolCatalogue(),
      ...(rc.mcpTools ?? runnerRuntime.mcpToolDefinitions),
    ] as Array<{ name: string; description?: string; schema?: unknown }>;

    try {
      const deps = getRunnerDeps();
      const rubric = loadRubric(rc.agentCategory);
      // Pass 18 — consume recent trace summaries so the context builder
      // has a short "what ran recently for this task" tail. Failure to
      // fetch (dev mode, no DB) is non-fatal; the builder already
      // handles `undefined` by skipping the trace chunk.
      let recentTraceSummaries: string[] | undefined;
      try {
        const summaries = await fetchRecentTraceSummaries({ limit: 5 });
        recentTraceSummaries = summaries.map(stringifyTraceSummary);
        if (recentTraceSummaries.length === 0) {
          recentTraceSummaries = undefined;
        }
      } catch (err) {
        console.warn(
          "[build_context] fetchRecentTraceSummaries failed:",
          (err as Error).message,
        );
        recentTraceSummaries = undefined;
      }
      const input: BuildContextInput = {
        taskId: rc.taskId,
        taskInstruction: rc.instruction,
        agentCategory: rc.agentCategory,
        rubric,
        toolCatalog: toolCatalogue,
        tokenBudget: DEFAULT_CONTEXT_TOKEN_BUDGET,
        ...(recentTraceSummaries !== undefined ? { recentTraceSummaries } : {}),
      };
      const result = await buildDynamicContext(input, deps);
      return {
        kind: "goto",
        next: NODE_EXPLORE,
        contextPatch: {
          systemPrompt: result.systemPrompt,
          contextBuildMeta: result.meta,
        },
      };
    } catch (err) {
      console.warn(
        "[build_context] dynamic builder failed, falling back to static prompt:",
        (err as Error).message,
      );
      const systemPrompt = await buildStaticContext(rc);
      return {
        kind: "goto",
        next: NODE_EXPLORE,
        contextPatch: { systemPrompt },
      };
    }
  },
};

// ---------------------------------------------------------------------------
// explore node (pass 14)
// ---------------------------------------------------------------------------
//
// Reads the current `RunnerContext`, asks the Actor (via
// `proposeExplorationStep`) whether to continue exploring or stop. On
// `continue`, executes the chosen read-only tool (MCP → fallback synthetic
// handler for Read/Grep/Glob in NODE_ENV=test), pushes the step onto
// `explorationHistory`, decrements the budget, and self-loops. On `stop` OR
// budget exhaustion, emits a terse summary into `explorationNotes` and
// routes to `propose_plan`.
//
// Every step emits an OTEL span tagged with tool + budget for observability.
//
// Tool dispatch priority:
//   1. Registered MCP client (production path).
//   2. Synthetic Read/Grep/Glob handler (tests only, keyed off NODE_ENV).
//   3. Reject → stop with reason "tool_unavailable".
async function runSyntheticReadOnlyTool(
  tool: string,
  args: Record<string, unknown>,
  rc: RunnerContext,
): Promise<unknown> {
  if (tool === "Read" || tool === "read_file") {
    const raw =
      typeof args.filePath === "string"
        ? args.filePath
        : typeof args.file_path === "string"
          ? (args.file_path as string)
          : "";
    const abs = path.isAbsolute(raw) ? raw : path.join(rc.worktreePath, raw);
    if (!fs.existsSync(abs)) return { error: `not_found:${abs}` };
    return { content: fs.readFileSync(abs, "utf8").slice(0, 4000) };
  }
  if (tool === "Glob") {
    const pattern =
      typeof args.pattern === "string" ? (args.pattern as string) : "";
    try {
      const out = execSync(`ls ${pattern} 2>/dev/null || true`, {
        cwd: rc.worktreePath,
        encoding: "utf8",
      });
      return { matches: out.split("\n").filter(Boolean).slice(0, 100) };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }
  if (tool === "Grep") {
    const pattern =
      typeof args.pattern === "string" ? (args.pattern as string) : "";
    try {
      const out = execSync(
        `grep -r ${JSON.stringify(pattern)} . 2>/dev/null | head -50 || true`,
        { cwd: rc.worktreePath, encoding: "utf8" },
      );
      return { matches: out.split("\n").filter(Boolean).slice(0, 50) };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }
  return { error: `unknown_synthetic_tool:${tool}` };
}

async function dispatchExplorationTool(
  tool: string,
  args: Record<string, unknown>,
  rc: RunnerContext,
): Promise<unknown> {
  // 1. Prefer a registered MCP client (production).
  const candidates = [tool, tool.replace(/_/g, "-"), tool.replace(/-/g, "_")];
  for (const client of Object.values(runnerRuntime.mcpClients)) {
    for (const candidate of candidates) {
      try {
        const result = await client.callTool({
          name: candidate,
          arguments: args,
        });
        return { result: result.content };
      } catch (_err) {
        continue;
      }
    }
  }
  // 2. Test fallback for Read/Grep/Glob.
  if (process.env.NODE_ENV === "test") {
    return runSyntheticReadOnlyTool(tool, args, rc);
  }
  // 3. Production: no handler → reject.
  return { error: `tool_unavailable:${tool}` };
}

function summarizeExploration(history: ReadonlyArray<ExplorationStep>): string {
  if (history.length === 0) return "No exploration steps taken.";
  const lines: string[] = [`Exploration (${history.length} step(s)):`];
  for (const s of history) {
    const r =
      typeof s.result === "string" ? s.result : JSON.stringify(s.result ?? "");
    lines.push(`- ${s.tool}(${JSON.stringify(s.args)}) -> ${r.slice(0, 200)}`);
  }
  return lines.join("\n");
}

const exploreNode: Node = {
  name: NODE_EXPLORE,
  async run(ctx: GraphContext): Promise<NodeOutcome> {
    const rc = asRunnerContext(ctx);
    // Pass 18 — elevate the per-step OTEL event to a full `Explorer:step`
    // span carrying the standardized attribute schema (`ROLE`, `TASK_ID`,
    // `AGENT_CATEGORY`, `NODE`, `MODEL_ID`). Step-local values stay on
    // explicit `exploration.*` keys because they are transient (not part
    // of the cross-role schema contract).
    const tracer = getTracer("explore-node");
    return tracer.startActiveSpan(
      "Explorer:step",
      async (span): Promise<NodeOutcome> => {
        span.setAttribute(SPAN_ATTR.ROLE, SPAN_ROLE.EXPLORER);
        span.setAttribute(SPAN_ATTR.TASK_ID, rc.taskId);
        span.setAttribute(SPAN_ATTR.AGENT_CATEGORY, rc.agentCategory);
        span.setAttribute(SPAN_ATTR.NODE, NODE_EXPLORE);
        span.setAttribute(SPAN_ATTR.MODEL_ID, runnerRuntime.roleModelId);
        span.setAttribute("exploration.budget.remaining", rc.explorationBudget);
        span.setAttribute(
          "exploration.history.length",
          rc.explorationHistory.length,
        );
        try {
          // Budget exhausted → short-circuit to propose_plan.
          if (rc.explorationBudget <= 0) {
            span.setAttribute("exploration.outcome", "budget_exhausted");
            span.end();
            return {
              kind: "goto",
              next: NODE_PROPOSE_PLAN,
              contextPatch: {
                explorationNotes: summarizeExploration(rc.explorationHistory),
              },
            };
          }

          const rawCatalog = (rc.mcpTools ??
            runnerRuntime.mcpToolDefinitions) as Array<{
            name: string;
            description?: string;
            schema?: unknown;
          }>;
          const allowedTools = filterReadOnlyTools(rawCatalog ?? []);
          const explorationCtx: ExplorationContext = {
            taskId: rc.taskId,
            taskInstruction: rc.instruction,
            agentCategory: rc.agentCategory,
            allowedTools,
            history: rc.explorationHistory,
            budget: rc.explorationBudget,
          };
          const provider = getProvider(runnerRuntime.roleProviderName);
          const outcome = await proposeExplorationStep(
            explorationCtx,
            provider,
            runnerRuntime.roleModelId,
          );
          span.setAttribute("exploration.outcome", outcome.kind);

          if (outcome.kind === "stop") {
            if (outcome.reason)
              span.setAttribute("exploration.reason", outcome.reason);
            span.end();
            return {
              kind: "goto",
              next: NODE_PROPOSE_PLAN,
              contextPatch: {
                explorationNotes: summarizeExploration(rc.explorationHistory),
              },
            };
          }

          // continue — execute the chosen tool.
          const nextStep = outcome.nextStep;
          span.setAttribute("exploration.tool", nextStep.tool);
          const args = (nextStep.args ?? {}) as Record<string, unknown>;
          const result = await dispatchExplorationTool(nextStep.tool, args, rc);
          const step: ExplorationStep = {
            tool: nextStep.tool,
            args,
            result,
            timestamp: new Date().toISOString(),
          };
          span.end();
          return {
            kind: "goto",
            next: NODE_EXPLORE,
            contextPatch: {
              explorationHistory: [...rc.explorationHistory, step],
              explorationBudget: rc.explorationBudget - 1,
            },
          };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          span.recordException(e);
          span.setAttribute("error", true);
          span.end();
          // Abort exploration on error; let propose_plan try with whatever
          // history we already have.
          return {
            kind: "goto",
            next: NODE_PROPOSE_PLAN,
            contextPatch: {
              explorationNotes: `Exploration aborted: ${e.message}`,
            },
          };
        }
      },
    );
  },
};

const proposePlanNode: Node = {
  name: NODE_PROPOSE_PLAN,
  async run(ctx: GraphContext): Promise<NodeOutcome> {
    const rc = asRunnerContext(ctx);
    try {
      const provider = getProvider(runnerRuntime.roleProviderName);
      const actorInput: ActorInput = {
        taskId: rc.taskId,
        taskInstruction: rc.instruction,
        chatHistory: rc.chatHistory,
        toolCatalog: [
          ...baseToolCatalogue(),
          ...(rc.mcpTools ?? runnerRuntime.mcpToolDefinitions),
        ],
        systemPrompt:
          rc.systemPrompt ??
          "Propose a plan to accomplish the task instruction.",
        // Pass 14 — surface accumulated exploration findings to the Actor.
        ...(rc.explorationNotes !== undefined
          ? { explorationNotes: rc.explorationNotes }
          : {}),
      };
      // Pass 12 — resolve the per-category rubric from the registry.
      const rubric = loadRubric(rc.agentCategory);
      const outcome = await runActorCriticLoop(
        actorInput,
        rubric,
        provider,
        runnerRuntime.roleModelId,
      );
      if (outcome.kind === "exhausted") {
        await markIssueNeedsHuman(rc.taskId);
        return {
          kind: "interrupt",
          reason: INTERRUPT_REASON_ACTOR_CRITIC_EXHAUSTED,
          contextPatch: {
            error: {
              message: `plan_rejected_after_${outcome.cyclesUsed}_cycles`,
            },
          },
        };
      }
      const approved: ActorProposal = outcome.proposal;
      const plan =
        approved.plan ??
        approved.finalMessage ??
        `Plan for task ${rc.taskId}: (approved without explicit plan text).`;
      return {
        kind: "goto",
        next: NODE_EXECUTE_STEP,
        contextPatch: { plan },
      };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      return { kind: "error", error: e };
    }
  },
};

const executeStepNode: Node = {
  name: NODE_EXECUTE_STEP,
  async run(ctx: GraphContext): Promise<NodeOutcome> {
    const rc = asRunnerContext(ctx);
    try {
      const provider = getProvider(runnerRuntime.roleProviderName);
      const actorInput: ActorInput = {
        taskId: rc.taskId,
        taskInstruction: rc.instruction,
        chatHistory: rc.chatHistory,
        toolCatalog: [
          ...baseToolCatalogue(),
          ...(rc.mcpTools ?? runnerRuntime.mcpToolDefinitions),
        ],
        systemPrompt:
          rc.systemPrompt ??
          "Choose the next tool call or emit a final message.",
      };
      // Pass 12 — resolve the per-category rubric from the registry.
      const rubric = loadRubric(rc.agentCategory);
      const outcome = await runActorCriticLoop(
        actorInput,
        rubric,
        provider,
        runnerRuntime.roleModelId,
      );
      if (outcome.kind === "exhausted") {
        await markIssueNeedsHuman(rc.taskId);
        return {
          kind: "interrupt",
          reason: INTERRUPT_REASON_ACTOR_CRITIC_EXHAUSTED,
          contextPatch: {
            error: {
              message: `step_rejected_after_${outcome.cyclesUsed}_cycles`,
            },
          },
        };
      }
      const approved: ActorProposal = outcome.proposal;
      const nextIterations = rc.iterations + 1;

      if (approved.kind === "tool_call" && approved.toolCall) {
        const call: FunctionCallLike = {
          name: approved.toolCall.name,
          args:
            (approved.toolCall.args as Record<string, unknown> | undefined) ??
            {},
        };
        const observation = await dispatchToolCall(call, rc);
        const appendedHistory: RunnerChatMessage[] = [
          ...rc.chatHistory,
          {
            role: "model",
            content: `tool_call ${call.name}`,
          },
        ];
        return {
          kind: "goto",
          next: NODE_RECORD_OBSERVATION,
          contextPatch: {
            chatHistory: appendedHistory,
            lastObservation: observation,
            iterations: nextIterations,
          },
        };
      }

      // `final_message` or `plan` both terminate the step loop — route to
      // evaluate_completion so the existing DONE-detection kicks in.
      const finalText =
        approved.finalMessage ??
        approved.plan ??
        "(actor returned empty final message)";
      const appendedHistory: RunnerChatMessage[] = [
        ...rc.chatHistory,
        { role: "model", content: finalText },
      ];
      return {
        kind: "goto",
        next: NODE_EVALUATE_COMPLETION,
        contextPatch: {
          chatHistory: appendedHistory,
          iterations: nextIterations,
        },
      };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      return {
        kind: "goto",
        next: NODE_COMMIT_OR_LOOP,
        contextPatch: {
          error: { message: e.message, stack: e.stack },
        },
      };
    }
  },
};

const recordObservationNode: Node = {
  name: NODE_RECORD_OBSERVATION,
  async run(ctx: GraphContext): Promise<NodeOutcome> {
    const rc = asRunnerContext(ctx);
    const workerId =
      process.env.WARM_POOL_ID || process.env.WORKER_ID || "runner";
    const obsSummary =
      typeof rc.lastObservation === "string"
        ? rc.lastObservation
        : JSON.stringify(rc.lastObservation ?? "").slice(0, 2000);
    try {
      await shareDiscovery(workerId, rc.taskId, `Observation: ${obsSummary}`);
    } catch (err) {
      console.warn(
        "[record_observation] shareDiscovery failed:",
        (err as Error).message,
      );
    }
    return {
      kind: "goto",
      next: NODE_EXECUTE_STEP,
      contextPatch: {
        chatHistory: [...rc.chatHistory, { role: "tool", content: obsSummary }],
      },
    };
  },
};

const evaluateCompletionNode: Node = {
  name: NODE_EVALUATE_COMPLETION,
  async run(ctx: GraphContext): Promise<NodeOutcome> {
    const rc = asRunnerContext(ctx);

    // Pass 12 — iteration-budget exhaustion still short-circuits the
    // reflection loop (we do not burn provider calls after the caller's
    // hard cap). Routes to commit_or_loop with `max_iterations`.
    if (rc.iterations >= rc.maxIterations) {
      return {
        kind: "goto",
        next: NODE_COMMIT_OR_LOOP,
        contextPatch: { completionReason: "max_iterations" },
      };
    }

    // Pass 12 — replace the DONE-token heuristic with an Actor/Critic
    // cycle. The Actor receives the chat history and a final-answer
    // prompt; the Critic scores against the per-category rubric. Approved
    // → commit; exhausted → needs_human + interrupt.
    try {
      const provider = getProvider(runnerRuntime.roleProviderName);
      const actorInput: ActorInput = {
        taskId: rc.taskId,
        taskInstruction: rc.instruction,
        chatHistory: rc.chatHistory,
        toolCatalog: [
          ...baseToolCatalogue(),
          ...(rc.mcpTools ?? runnerRuntime.mcpToolDefinitions),
        ],
        systemPrompt:
          rc.systemPrompt ??
          "Decide whether the task is complete. Emit a final message if so; otherwise propose the next tool call.",
      };
      const rubric = loadRubric(rc.agentCategory);
      const outcome = await runActorCriticLoop(
        actorInput,
        rubric,
        provider,
        runnerRuntime.roleModelId,
      );
      if (outcome.kind === "exhausted") {
        await markIssueNeedsHuman(rc.taskId);
        return {
          kind: "interrupt",
          reason: INTERRUPT_REASON_ACTOR_CRITIC_EXHAUSTED,
          contextPatch: {
            error: {
              message: `evaluate_rejected_after_${outcome.cyclesUsed}_cycles`,
            },
          },
        };
      }
      const approved: ActorProposal = outcome.proposal;
      // `final_message` / `plan` = task complete; `tool_call` = keep going.
      if (approved.kind === "tool_call" && approved.toolCall) {
        return { kind: "goto", next: NODE_EXECUTE_STEP };
      }
      return {
        kind: "goto",
        next: NODE_COMMIT_OR_LOOP,
        contextPatch: { completionReason: "critic_approved" },
      };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      return {
        kind: "goto",
        next: NODE_COMMIT_OR_LOOP,
        contextPatch: { error: { message: e.message, stack: e.stack } },
      };
    }
  },
};

const commitOrLoopNode: Node = {
  name: NODE_COMMIT_OR_LOOP,
  async run(ctx: GraphContext): Promise<NodeOutcome> {
    const rc = asRunnerContext(ctx);
    if (rc.error) {
      try {
        await markTaskComplete(rc.taskId, `FAILED: ${rc.error.message}`);
      } catch (err) {
        console.warn(
          "[commit_or_loop] markTaskComplete (error path) failed:",
          (err as Error).message,
        );
      }
      return {
        kind: "error",
        error: new Error(rc.error.message),
      };
    }

    const lastText =
      rc.chatHistory[rc.chatHistory.length - 1]?.content ?? "(no output)";
    try {
      await markTaskComplete(rc.taskId, lastText.slice(0, 2000));
    } catch (err) {
      console.warn(
        "[commit_or_loop] markTaskComplete failed:",
        (err as Error).message,
      );
    }
    return {
      kind: "complete",
      contextPatch: {
        completionReason: rc.completionReason ?? "done_token",
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Tool dispatch helper (shared between execute_step and tests).
// ---------------------------------------------------------------------------

interface FunctionCallLike {
  name: string;
  args: Record<string, unknown>;
}

async function dispatchToolCall(
  call: FunctionCallLike,
  rc: RunnerContext,
): Promise<unknown> {
  const args = call.args as Record<string, unknown>;
  const worktreePath = rc.worktreePath;
  const rawFilePath = typeof args.filePath === "string" ? args.filePath : "";
  const absPath = path.isAbsolute(rawFilePath)
    ? rawFilePath
    : path.join(worktreePath, rawFilePath);

  try {
    if (call.name === "read_file") {
      const content = fs.readFileSync(absPath, "utf8");
      return { content: content.slice(0, 10000) };
    }
    if (call.name === "write_file") {
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, String(args.content ?? ""), "utf8");
      return { success: true };
    }
    if (call.name === "exec_command") {
      const out = execSync(String(args.command ?? ""), {
        cwd: worktreePath,
        encoding: "utf8",
      });
      return { output: out.slice(0, 10000) };
    }
    if (call.name === "ollama_generate") {
      const res = await fetch(
        `http://host.docker.internal:11434/api/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            model: args.model,
            prompt: args.prompt,
            stream: false,
          }),
        },
      );
      const data = (await res.json()) as { response?: string };
      return { output: data.response };
    }

    // MCP fallthrough: try each registered client; return the first success.
    const originalToolName = call.name.replace(/_/g, "-");
    for (const client of Object.values(runnerRuntime.mcpClients)) {
      try {
        const result = await client.callTool({
          name: originalToolName,
          arguments: args,
        });
        return { result: result.content };
      } catch (_dashed) {
        try {
          const result = await client.callTool({
            name: call.name,
            arguments: args,
          });
          return { result: result.content };
        } catch (_snake) {
          continue;
        }
      }
    }
    throw new Error(
      `Tool ${call.name} not found in base list or MCP registry.`,
    );
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// Gemini model singleton (per-process) removed in pass 11: the Actor role
// now drives inference via the `LLMProviderAdapter` registry, so `nodes.ts`
// no longer calls `GoogleGenerativeAI.getGenerativeModel` directly. The
// `runnerRuntime.genAI` / `model` fields remain so tests that previously
// reset them continue to compile.

// ---------------------------------------------------------------------------
// Exported node registry + graph factory.
// ---------------------------------------------------------------------------

export const nodes: Record<NodeName, Node> = {
  [NODE_INIT_MCP]: initMcpNode,
  [NODE_BUILD_CONTEXT]: buildContextNode,
  [NODE_EXPLORE]: exploreNode,
  [NODE_PROPOSE_PLAN]: proposePlanNode,
  [NODE_EXECUTE_STEP]: executeStepNode,
  [NODE_RECORD_OBSERVATION]: recordObservationNode,
  [NODE_EVALUATE_COMPLETION]: evaluateCompletionNode,
  [NODE_COMMIT_OR_LOOP]: commitOrLoopNode,
};

export function defineAgentGraph(): StateGraph {
  return defineGraph({
    startNode: NODE_INIT_MCP,
    nodes,
  });
}
