// Pass 21 — SCION operations-console introspection.
//
// Server-side, read-only view into the running orchestration plane. Four
// public functions, each backing one `/api/scion/*` route:
//
//   - getConfigSnapshot()      → providers / embeddings / env-sanity / mcp /
//                                 rubric registry / graph topology.
//   - getAbilities(category)   → per-category rubric + provider + tool catalog
//                                 (with read-only-allowed flag from pass 14).
//   - getWorkflow(issueId)     → TaskGraphState projection with cycle counts
//                                 and the last critic verdict (if present).
//   - listLiveWorkers()        → `docker ps` parse; empty when docker absent.
//
// Hard rules honoured here:
//   - Secrets never leave this module. `envSanity` reports only presence
//     booleans, never values.
//   - MCP reachability is a cheap `fs.existsSync` check against the entrypoint
//     path — full liveness probes would stall the dashboard.
//   - Graph topology is HARD-CODED to match `scripts/swarm/runner/nodes.ts`
//     (see checkpoint-15.md invariant). Runtime introspection would couple
//     the dashboard to the runner's mutable module state.
//   - `lib/` must not import from `scripts/`; we mirror the provider list and
//     topology shape by value.

import fs from "fs";
import { spawnSync } from "child_process";
import path from "path";

import prisma from "@/lib/prisma";
import { loadRubric } from "@/lib/orchestration/rubrics";
import { DEFAULT_RUBRIC } from "@/lib/orchestration/rubrics/default";
import { QA_RUBRIC } from "@/lib/orchestration/rubrics/1_qa";
import { SOURCE_CONTROL_RUBRIC } from "@/lib/orchestration/rubrics/2_source_control";
import { CLOUD_RUBRIC } from "@/lib/orchestration/rubrics/3_cloud";
import { DB_RUBRIC } from "@/lib/orchestration/rubrics/4_db";
import { BIZOPS_RUBRIC } from "@/lib/orchestration/rubrics/5_bizops";
import type { Rubric } from "@/lib/orchestration/rubrics/types";
import { filterReadOnlyTools } from "@/lib/orchestration/explorer";
import { getEmbeddingProvider } from "@/lib/orchestration/embeddings";
import type { HistoryEntry, NodeName } from "@/lib/orchestration/graph/types";

// ---------------------------------------------------------------------------
// Shared graph topology (hard-coded — matches scripts/swarm/runner/nodes.ts).
// ---------------------------------------------------------------------------

export interface GraphTopology {
  nodes: string[];
  edges: Array<{ from: string; to: string; label?: string }>;
}

export const GRAPH_TOPOLOGY: GraphTopology = {
  nodes: [
    "init_mcp",
    "build_context",
    "explore",
    "propose_plan",
    "execute_step",
    "record_observation",
    "evaluate_completion",
    "commit_or_loop",
  ],
  edges: [
    { from: "init_mcp", to: "build_context" },
    { from: "build_context", to: "explore" },
    { from: "explore", to: "explore", label: "continue" },
    { from: "explore", to: "propose_plan", label: "stop/budget" },
    { from: "propose_plan", to: "execute_step" },
    { from: "execute_step", to: "record_observation", label: "tool_call" },
    { from: "execute_step", to: "evaluate_completion", label: "final" },
    { from: "record_observation", to: "execute_step" },
    { from: "evaluate_completion", to: "execute_step", label: "continue" },
    { from: "evaluate_completion", to: "commit_or_loop", label: "done" },
    { from: "execute_step", to: "commit_or_loop", label: "error" },
  ],
};

// ---------------------------------------------------------------------------
// Config snapshot.
// ---------------------------------------------------------------------------

export interface ConfigSnapshotProvider {
  name: string;
  available: boolean;
  reason?: string;
}

export interface ConfigSnapshotEmbeddings {
  name: string;
  dim: number;
  available: boolean;
}

export interface ConfigSnapshotEnvEntry {
  key: string;
  present: boolean;
  sensitive: boolean;
}

export interface ConfigSnapshotMcpServer {
  name: string;
  entrypoint: string;
  reachable: boolean;
}

export interface ConfigSnapshotRubricEntry {
  category: string;
  checkCount: number;
}

export interface ConfigSnapshot {
  providers: ConfigSnapshotProvider[];
  categoryOverrides: Record<string, string>;
  defaultProvider: string;
  embeddings: ConfigSnapshotEmbeddings;
  envSanity: ConfigSnapshotEnvEntry[];
  mcpServers: ConfigSnapshotMcpServer[];
  rubricRegistry: ConfigSnapshotRubricEntry[];
  graphTopology: GraphTopology;
}

// Env-sanity inventory. Values are NEVER exposed — only presence booleans.
const ENV_SANITY_KEYS: ReadonlyArray<{ key: string; sensitive: boolean }> = [
  { key: "DATABASE_URL", sensitive: true },
  { key: "GEMINI_API_KEY", sensitive: true },
  { key: "NEXTAUTH_SECRET", sensitive: true },
  { key: "ORCHESTRATOR_SHARED_SECRET", sensitive: true },
  { key: "PAPERCLIP_PROXY_URL", sensitive: false },
  { key: "PAPERCLIP_MODEL", sensitive: false },
  { key: "CATEGORY_PROVIDER_OVERRIDES", sensitive: false },
];

// Mirror of scripts/swarm/providers.ts adapters (Gemini, Paperclip). Kept by
// value here so `lib/` doesn't import from `scripts/`.
const KNOWN_PROVIDERS: ReadonlyArray<string> = ["gemini", "paperclip"];

// Mirror of scripts/swarm/policy.ts default provider.
const DEFAULT_PROVIDER = "gemini";

function parseCategoryProviderOverrides(): Record<string, string> {
  const raw = process.env.CATEGORY_PROVIDER_OVERRIDES;
  if (!raw || raw.trim() === "") {
    return { "1_qa": "paperclip" };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return { "1_qa": "paperclip" };
    }
    const out: Record<string, string> = {};
    for (const [cat, prov] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof prov === "string" && prov.length > 0) out[cat] = prov;
    }
    return out;
  } catch {
    return { "1_qa": "paperclip" };
  }
}

function providerAvailability(name: string): ConfigSnapshotProvider {
  if (name === "gemini") {
    const present = Boolean(process.env.GEMINI_API_KEY);
    return present
      ? { name, available: true }
      : { name, available: false, reason: "GEMINI_API_KEY not set" };
  }
  if (name === "paperclip") {
    const url = process.env.PAPERCLIP_PROXY_URL;
    const model = process.env.PAPERCLIP_MODEL;
    if (!url || !model) {
      return {
        name,
        available: false,
        reason: "PAPERCLIP_PROXY_URL and PAPERCLIP_MODEL required",
      };
    }
    return { name, available: true };
  }
  return { name, available: false, reason: "unknown provider" };
}

function embeddingsSnapshot(): ConfigSnapshotEmbeddings {
  try {
    const p = getEmbeddingProvider();
    return {
      name: p.name,
      dim: p.dim,
      available: Boolean(process.env.GEMINI_API_KEY) || p.name === "stub-hash",
    };
  } catch {
    return {
      name: "unknown",
      dim: 0,
      available: false,
    };
  }
}

function envSanitySnapshot(): ConfigSnapshotEnvEntry[] {
  return ENV_SANITY_KEYS.map(({ key, sensitive }) => {
    const raw = process.env[key];
    const present = typeof raw === "string" && raw.length > 0;
    return { key, present, sensitive };
  });
}

const MCP_REGISTRY_PATH = path.join(process.cwd(), ".gemini", "mcp.json");

function mcpServersSnapshot(): ConfigSnapshotMcpServer[] {
  // Read .gemini/mcp.json and cheap-check each entrypoint's existence.
  try {
    if (!fs.existsSync(MCP_REGISTRY_PATH)) return [];
    const raw = fs.readFileSync(MCP_REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(raw) as {
      mcpServers?: Record<
        string,
        { command?: string; args?: string[] } | undefined
      >;
    };
    const servers = parsed.mcpServers ?? {};
    const out: ConfigSnapshotMcpServer[] = [];
    for (const [name, cfg] of Object.entries(servers)) {
      if (!cfg) continue;
      const args = cfg.args ?? [];
      // First arg is typically the script path; for npx / docker it's a pkg.
      const entrypoint = args[0] ?? cfg.command ?? "";
      // Only test existence when entrypoint looks like an absolute path.
      let reachable = false;
      if (
        typeof entrypoint === "string" &&
        entrypoint.length > 0 &&
        (entrypoint.startsWith("/") || /^[A-Za-z]:[\\/]/.test(entrypoint))
      ) {
        try {
          reachable = fs.existsSync(entrypoint);
        } catch {
          reachable = false;
        }
      } else {
        // For npx / docker entrypoints we can't prove reachability cheaply;
        // report false rather than mislead the operator.
        reachable = false;
      }
      out.push({ name, entrypoint: String(entrypoint), reachable });
    }
    return out;
  } catch {
    return [];
  }
}

function rubricRegistrySnapshot(): ConfigSnapshotRubricEntry[] {
  const all: Rubric[] = [
    DEFAULT_RUBRIC,
    QA_RUBRIC,
    SOURCE_CONTROL_RUBRIC,
    CLOUD_RUBRIC,
    DB_RUBRIC,
    BIZOPS_RUBRIC,
  ];
  return all.map((r) => ({ category: r.name, checkCount: r.checks.length }));
}

export async function getConfigSnapshot(): Promise<ConfigSnapshot> {
  const categoryOverrides = parseCategoryProviderOverrides();
  const providers = KNOWN_PROVIDERS.map(providerAvailability);
  const embeddings = embeddingsSnapshot();
  const envSanity = envSanitySnapshot();
  const mcpServers = mcpServersSnapshot();
  const rubricRegistry = rubricRegistrySnapshot();
  return {
    providers,
    categoryOverrides,
    defaultProvider: DEFAULT_PROVIDER,
    embeddings,
    envSanity,
    mcpServers,
    rubricRegistry,
    graphTopology: GRAPH_TOPOLOGY,
  };
}

// ---------------------------------------------------------------------------
// Abilities.
// ---------------------------------------------------------------------------

export interface AbilityTool {
  name: string;
  description?: string;
  readOnlyAllowed: boolean;
}

export interface AbilitySnapshot {
  category: string;
  rubric: {
    name: string;
    description: string;
    checks: Array<{ id: string; description: string }>;
  };
  provider: string;
  toolCatalog: ReadonlyArray<AbilityTool>;
}

// Static base tool catalogue mirrored from scripts/swarm/runner/nodes.ts
// (`baseToolCatalogue`). Kept here by value because `lib/` cannot import
// from `scripts/`. Additions there should be mirrored here (single point
// of drift — the introspection route advertises what operators actually
// see in the dashboard, not the running agent's ephemeral MCP tool list).
const BASE_TOOL_CATALOGUE: ReadonlyArray<{
  name: string;
  description: string;
}> = [
  { name: "read_file", description: "Reads the content of a file" },
  { name: "write_file", description: "Writes content to a file" },
  { name: "exec_command", description: "Executes a shell command" },
  { name: "ollama_generate", description: "Direct GPU inference" },
  {
    name: "store_memory",
    description: "Stores a knowledge fragment into swarm memory.",
  },
  {
    name: "create_memory_relation",
    description: "Creates a relationship between two memory fragments.",
  },
];

function resolveProviderForCategory(category: string): string {
  const overrides = parseCategoryProviderOverrides();
  if (overrides[category]) return overrides[category];
  return DEFAULT_PROVIDER;
}

export async function getAbilities(category: string): Promise<AbilitySnapshot> {
  const rubric = loadRubric(category);
  const readOnlyAllowed = new Set(
    filterReadOnlyTools(
      BASE_TOOL_CATALOGUE.map((t) => ({
        name: t.name,
        description: t.description,
      })),
    ).map((t) => t.name),
  );
  const toolCatalog: AbilityTool[] = BASE_TOOL_CATALOGUE.map((t) => ({
    name: t.name,
    description: t.description,
    readOnlyAllowed: readOnlyAllowed.has(t.name),
  }));
  return {
    category,
    rubric: {
      name: rubric.name,
      description: rubric.description,
      checks: rubric.checks.map((c) => ({
        id: c.id,
        description: c.description,
      })),
    },
    provider: resolveProviderForCategory(category),
    toolCatalog,
  };
}

// ---------------------------------------------------------------------------
// Workflow snapshot.
// ---------------------------------------------------------------------------

export interface WorkflowHistoryEntry {
  node: NodeName;
  enteredAt: string;
  exitedAt?: string;
  outcome: string;
  detail?: string;
  durationMs?: number;
}

export interface WorkflowSnapshot {
  issueId: string;
  status: string;
  currentNode: string | null;
  graphStatus: string;
  topology: GraphTopology;
  history: WorkflowHistoryEntry[];
  cycleCounts: Record<string, number>;
  lastCriticVerdict?: {
    verdict: string;
    confidence: number;
    rubric: string;
  };
}

function computeCycleCounts(
  history: ReadonlyArray<HistoryEntry>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of history) {
    counts[entry.node] = (counts[entry.node] ?? 0) + 1;
  }
  // Cycle count is re-entries — subtract 1 for the first visit. Never negative.
  const cycles: Record<string, number> = {};
  for (const [node, count] of Object.entries(counts)) {
    cycles[node] = Math.max(0, count - 1);
  }
  return cycles;
}

function extractLastCriticVerdict(
  graphContext: unknown,
  history: ReadonlyArray<HistoryEntry>,
): WorkflowSnapshot["lastCriticVerdict"] {
  // Best-effort: the orchestrator (scripts/swarm/roles/orchestrator.ts) may
  // persist a `lastCriticVerdict` field inside `GraphContext`. When absent
  // we return undefined rather than invent a verdict.
  if (
    graphContext &&
    typeof graphContext === "object" &&
    "lastCriticVerdict" in graphContext
  ) {
    const v = (graphContext as { lastCriticVerdict?: unknown })
      .lastCriticVerdict;
    if (
      v &&
      typeof v === "object" &&
      typeof (v as { verdict?: unknown }).verdict === "string"
    ) {
      const verdictObj = v as {
        verdict: string;
        confidence?: unknown;
        rubric?: unknown;
      };
      return {
        verdict: verdictObj.verdict,
        confidence:
          typeof verdictObj.confidence === "number" ? verdictObj.confidence : 0,
        rubric:
          typeof verdictObj.rubric === "string" ? verdictObj.rubric : "default",
      };
    }
  }
  // Secondary: scan history for an entry with an outcome=="interrupt" and
  // a detail that the orchestrator may have serialised.
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.outcome === "interrupt" && entry.detail) {
      return {
        verdict: "REWORK",
        confidence: 0,
        rubric: entry.detail,
      };
    }
  }
  return undefined;
}

export async function getWorkflow(
  issueId: string,
): Promise<WorkflowSnapshot | null> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: { graphState: true },
  });
  if (!issue) return null;
  if (!issue.graphState) {
    return {
      issueId: issue.id,
      status: issue.status,
      currentNode: null,
      graphStatus: "none",
      topology: GRAPH_TOPOLOGY,
      history: [],
      cycleCounts: {},
    };
  }
  const rawHistory: HistoryEntry[] = Array.isArray(issue.graphState.history)
    ? (issue.graphState.history as unknown as HistoryEntry[])
    : [];
  const cycleCounts = computeCycleCounts(rawHistory);
  const history: WorkflowHistoryEntry[] = rawHistory.map((entry) => {
    const entered = Date.parse(entry.enteredAt);
    const exited = Date.parse(entry.exitedAt);
    const durationMs =
      Number.isFinite(entered) && Number.isFinite(exited)
        ? Math.max(0, exited - entered)
        : undefined;
    return {
      node: entry.node,
      enteredAt: entry.enteredAt,
      exitedAt: entry.exitedAt,
      outcome: entry.outcome,
      ...(entry.detail ? { detail: entry.detail } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
    };
  });
  const lastCriticVerdict = extractLastCriticVerdict(
    issue.graphState.context,
    rawHistory,
  );
  return {
    issueId: issue.id,
    status: issue.status,
    currentNode: issue.graphState.currentNode,
    graphStatus: issue.graphState.status,
    topology: GRAPH_TOPOLOGY,
    history,
    cycleCounts,
    ...(lastCriticVerdict ? { lastCriticVerdict } : {}),
  };
}

// ---------------------------------------------------------------------------
// Live workers (docker ps).
// ---------------------------------------------------------------------------

export interface LiveWorker {
  containerId: string;
  name: string;
  image: string;
  status: string;
  ports: string[];
  startedAt: string;
  category?: string;
  currentIssueId?: string | null;
  uptimeSeconds: number;
}

interface DockerPsLine {
  ID?: string;
  Names?: string;
  Image?: string;
  State?: string;
  Status?: string;
  Ports?: string;
  CreatedAt?: string;
  RunningFor?: string;
}

function parseDockerPsOutput(stdout: string): LiveWorker[] {
  const out: LiveWorker[] = [];
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (const line of lines) {
    let obj: DockerPsLine;
    try {
      obj = JSON.parse(line) as DockerPsLine;
    } catch {
      continue;
    }
    const name = obj.Names ?? "";
    const createdAt = obj.CreatedAt ?? new Date().toISOString();
    const parsedStart = Date.parse(createdAt);
    const uptimeSeconds = Number.isFinite(parsedStart)
      ? Math.max(0, Math.floor((Date.now() - parsedStart) / 1000))
      : 0;
    // Category pattern: hlbw-worker-warm-<cat>-<n> or hlbw-worker-<cat>-*.
    let category: string | undefined;
    const match = name.match(/hlbw-worker-(?:warm-)?([a-z0-9_]+)/i);
    if (match) category = match[1];
    out.push({
      containerId: obj.ID ?? "",
      name,
      image: obj.Image ?? "",
      status: obj.State ?? obj.Status ?? "unknown",
      ports: (obj.Ports ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
      startedAt: createdAt,
      ...(category ? { category } : {}),
      currentIssueId: null,
      uptimeSeconds,
    });
  }
  return out;
}

export async function listLiveWorkers(): Promise<LiveWorker[]> {
  let stdout: string;
  try {
    const result = spawnSync("docker", ["ps", "--format", "{{json .}}"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    if (result.error || result.status !== 0) return [];
    stdout = result.stdout ?? "";
  } catch {
    return [];
  }
  const workers = parseDockerPsOutput(stdout);
  if (workers.length === 0) return workers;

  // Best-effort: pair each worker to an in-progress Issue with matching
  // category. We accept some noise (N-to-M match when many categories are
  // busy) — this is a hint for operators, not an authoritative link.
  try {
    const categories = Array.from(
      new Set(workers.map((w) => w.category).filter(Boolean)),
    ) as string[];
    if (categories.length === 0) return workers;
    const activeIssues = await prisma.issue.findMany({
      where: {
        status: "in_progress",
        agentCategory: { in: categories },
      },
      orderBy: [{ startedAt: "desc" }],
      select: { id: true, agentCategory: true },
    });
    const claimed = new Set<string>();
    for (const w of workers) {
      if (!w.category) continue;
      const match = activeIssues.find(
        (i) => i.agentCategory === w.category && !claimed.has(i.id),
      );
      if (match) {
        w.currentIssueId = match.id;
        claimed.add(match.id);
      }
    }
  } catch {
    // DB unavailable — workers still returned without issue binding.
  }
  return workers;
}
