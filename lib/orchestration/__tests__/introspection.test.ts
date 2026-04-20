// Pass 21 — introspection tests.
//
// Covers:
//   - getConfigSnapshot envSanity reports presence booleans only (never
//     returns the env value itself).
//   - getAbilities("nonexistent") falls through to DEFAULT_RUBRIC.
//   - getWorkflow("missing") returns null.
//   - listLiveWorkers returns [] when `docker` exits non-zero.

import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";

const issueFindUnique = jest.fn<(args: unknown) => Promise<unknown>>();
const issueFindMany = jest.fn<(args: unknown) => Promise<unknown[]>>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    issue: {
      findUnique: (args: unknown) =>
        (issueFindUnique as unknown as (a: unknown) => Promise<unknown>)(args),
      findMany: (args: unknown) =>
        (issueFindMany as unknown as (a: unknown) => Promise<unknown[]>)(args),
    },
  },
}));

const spawnSyncMock =
  jest.fn<
    (
      cmd: string,
      args: ReadonlyArray<string>,
      opts: unknown,
    ) => { status: number; stdout?: string; stderr?: string; error?: Error }
  >();

jest.mock("child_process", () => ({
  __esModule: true,
  spawnSync: (cmd: string, args: ReadonlyArray<string>, opts: unknown) =>
    spawnSyncMock(cmd, args, opts),
}));

import {
  getConfigSnapshot,
  getAbilities,
  getWorkflow,
  listLiveWorkers,
  GRAPH_TOPOLOGY,
} from "../introspection";
import { resetEmbeddingProvider } from "../embeddings";

describe("getConfigSnapshot", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Strip env keys we test against so presence booleans are deterministic.
    for (const k of [
      "DATABASE_URL",
      "GEMINI_API_KEY",
      "NEXTAUTH_SECRET",
      "ORCHESTRATOR_SHARED_SECRET",
      "PAPERCLIP_PROXY_URL",
      "PAPERCLIP_MODEL",
      "CATEGORY_PROVIDER_OVERRIDES",
    ]) {
      delete process.env[k];
    }
    resetEmbeddingProvider();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(originalEnv)) {
      if (typeof v === "string") process.env[k] = v;
    }
    resetEmbeddingProvider();
  });

  it("reports envSanity present:false when env unset", async () => {
    const snap = await getConfigSnapshot();
    const dbEntry = snap.envSanity.find((e) => e.key === "DATABASE_URL");
    expect(dbEntry).toBeDefined();
    expect(dbEntry?.present).toBe(false);
    expect(dbEntry?.sensitive).toBe(true);
  });

  it("reports envSanity present:true only when env set — never the value", async () => {
    process.env.GEMINI_API_KEY = "secret-value-must-not-leak";
    const snap = await getConfigSnapshot();
    const geminiEntry = snap.envSanity.find((e) => e.key === "GEMINI_API_KEY");
    expect(geminiEntry?.present).toBe(true);
    // Serialised snapshot must not contain the secret anywhere.
    const serialised = JSON.stringify(snap);
    expect(serialised).not.toContain("secret-value-must-not-leak");
  });

  it("advertises gemini + paperclip providers with availability flags", async () => {
    const snap = await getConfigSnapshot();
    const names = snap.providers.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["gemini", "paperclip"]));
    // Gemini is unavailable without GEMINI_API_KEY.
    const gemini = snap.providers.find((p) => p.name === "gemini");
    expect(gemini?.available).toBe(false);
    expect(gemini?.reason).toMatch(/GEMINI_API_KEY/);
  });

  it("includes hard-coded graph topology with 8 nodes", async () => {
    const snap = await getConfigSnapshot();
    expect(snap.graphTopology.nodes).toHaveLength(8);
    expect(snap.graphTopology.nodes).toEqual(GRAPH_TOPOLOGY.nodes);
    expect(snap.graphTopology.edges.length).toBeGreaterThan(0);
  });

  it("rubricRegistry lists all 6 categories", async () => {
    const snap = await getConfigSnapshot();
    const categories = snap.rubricRegistry.map((r) => r.category).sort();
    expect(categories).toEqual(
      [
        "1_qa",
        "2_source_control",
        "3_cloud",
        "4_db",
        "5_bizops",
        "default",
      ].sort(),
    );
  });
});

describe("getAbilities", () => {
  it("returns DEFAULT_RUBRIC for an unknown category", async () => {
    const snap = await getAbilities("nonexistent_category_xyz");
    expect(snap.rubric.name).toBe("default");
    expect(snap.category).toBe("nonexistent_category_xyz");
    expect(snap.toolCatalog.length).toBeGreaterThan(0);
  });

  it("marks read-only tools via the filterReadOnlyTools allow-list", async () => {
    const snap = await getAbilities("4_db");
    const readFile = snap.toolCatalog.find((t) => t.name === "read_file");
    const writeFile = snap.toolCatalog.find((t) => t.name === "write_file");
    const execCmd = snap.toolCatalog.find((t) => t.name === "exec_command");
    expect(readFile?.readOnlyAllowed).toBe(true);
    expect(writeFile?.readOnlyAllowed).toBe(false);
    expect(execCmd?.readOnlyAllowed).toBe(false);
  });
});

describe("getWorkflow", () => {
  beforeEach(() => {
    issueFindUnique.mockReset();
  });

  it("returns null when the issue is absent", async () => {
    issueFindUnique.mockResolvedValue(null);
    const snap = await getWorkflow("missing-id");
    expect(snap).toBeNull();
  });

  it("computes cycleCounts from history re-entries", async () => {
    const now = new Date("2026-04-20T00:00:00Z");
    issueFindUnique.mockResolvedValue({
      id: "i-1",
      status: "in_progress",
      graphState: {
        currentNode: "execute_step",
        status: "running",
        context: {},
        history: [
          {
            node: "init_mcp",
            enteredAt: now.toISOString(),
            exitedAt: now.toISOString(),
            outcome: "ok",
          },
          {
            node: "build_context",
            enteredAt: now.toISOString(),
            exitedAt: now.toISOString(),
            outcome: "ok",
          },
          {
            node: "execute_step",
            enteredAt: now.toISOString(),
            exitedAt: now.toISOString(),
            outcome: "ok",
          },
          {
            node: "record_observation",
            enteredAt: now.toISOString(),
            exitedAt: now.toISOString(),
            outcome: "ok",
          },
          {
            node: "execute_step",
            enteredAt: now.toISOString(),
            exitedAt: now.toISOString(),
            outcome: "ok",
          },
        ],
      },
    });
    const snap = await getWorkflow("i-1");
    expect(snap).not.toBeNull();
    expect(snap?.currentNode).toBe("execute_step");
    expect(snap?.cycleCounts["execute_step"]).toBe(1);
    expect(snap?.cycleCounts["init_mcp"]).toBe(0);
    expect(snap?.history).toHaveLength(5);
  });
});

describe("listLiveWorkers", () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
    issueFindMany.mockReset();
  });

  it("returns [] when docker exits non-zero", async () => {
    spawnSyncMock.mockReturnValue({
      status: 127,
      stdout: "",
      stderr: "not found",
    });
    const workers = await listLiveWorkers();
    expect(workers).toEqual([]);
  });

  it("returns [] when docker throws an error", async () => {
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: "",
      error: new Error("ENOENT"),
    });
    const workers = await listLiveWorkers();
    expect(workers).toEqual([]);
  });

  it("parses docker ps JSON lines and extracts category", async () => {
    const line = JSON.stringify({
      ID: "abc123",
      Names: "hlbw-worker-warm-4_db-1",
      Image: "hlbw-ai-hub:latest",
      State: "running",
      Ports: "3000/tcp",
      CreatedAt: new Date().toISOString(),
    });
    spawnSyncMock.mockReturnValue({ status: 0, stdout: `${line}\n` });
    issueFindMany.mockResolvedValue([]);
    const workers = await listLiveWorkers();
    expect(workers).toHaveLength(1);
    expect(workers[0].name).toBe("hlbw-worker-warm-4_db-1");
    expect(workers[0].category).toBe("4_db");
    expect(workers[0].currentIssueId).toBeNull();
  });
});
