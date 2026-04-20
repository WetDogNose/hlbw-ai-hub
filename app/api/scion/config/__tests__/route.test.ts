// Pass 21 — GET /api/scion/config unit tests.
//
// Mocks the introspection module so the route is a thin wrapper. Verifies
// shape + Cache-Control header + that no secret values ever traverse the
// route boundary.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { ConfigSnapshot } from "@/lib/orchestration/introspection";

const getConfigSnapshotMock = jest.fn<() => Promise<ConfigSnapshot>>();

jest.mock("@/lib/orchestration/introspection", () => ({
  __esModule: true,
  getConfigSnapshot: () =>
    (getConfigSnapshotMock as unknown as () => Promise<ConfigSnapshot>)(),
}));

import { GET } from "../route";

function mkSnapshot(overrides: Partial<ConfigSnapshot> = {}): ConfigSnapshot {
  return {
    providers: [
      { name: "gemini", available: false, reason: "GEMINI_API_KEY not set" },
      { name: "paperclip", available: false },
    ],
    categoryOverrides: { "1_qa": "paperclip" },
    defaultProvider: "gemini",
    embeddings: { name: "stub-hash", dim: 768, available: true },
    envSanity: [
      { key: "DATABASE_URL", present: false, sensitive: true },
      { key: "GEMINI_API_KEY", present: false, sensitive: true },
      { key: "NEXTAUTH_SECRET", present: false, sensitive: true },
    ],
    mcpServers: [],
    rubricRegistry: [
      { category: "default", checkCount: 3 },
      { category: "1_qa", checkCount: 4 },
    ],
    graphTopology: {
      nodes: ["init_mcp", "build_context"],
      edges: [{ from: "init_mcp", to: "build_context" }],
    },
    ...overrides,
  };
}

beforeEach(() => {
  getConfigSnapshotMock.mockReset();
});

describe("GET /api/scion/config", () => {
  it("returns the ConfigSnapshot with Cache-Control: no-store", async () => {
    getConfigSnapshotMock.mockResolvedValue(mkSnapshot());
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as ConfigSnapshot;
    expect(body.defaultProvider).toBe("gemini");
    expect(body.rubricRegistry).toHaveLength(2);
    expect(body.graphTopology.nodes).toContain("init_mcp");
  });

  it("never returns secret values (envSanity is presence-only)", async () => {
    // The introspection module never sees env values here; we assert the
    // route body never contains values that look like secrets.
    getConfigSnapshotMock.mockResolvedValue(mkSnapshot());
    const res = await GET();
    const text = await res.text();
    // No stray "=" followed by a long token — the shape is booleans.
    for (const entry of mkSnapshot().envSanity) {
      expect(text).not.toMatch(new RegExp(`${entry.key}":"[^"]+"`));
    }
  });

  it("returns 500 when introspection throws", async () => {
    getConfigSnapshotMock.mockRejectedValue(new Error("introspection fail"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.error).toMatch(/introspection fail/);
  });
});
