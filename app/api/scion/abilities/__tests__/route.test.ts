// Pass 21 — GET /api/scion/abilities unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { AbilitySnapshot } from "@/lib/orchestration/introspection";

const getAbilitiesMock =
  jest.fn<(category: string) => Promise<AbilitySnapshot>>();

jest.mock("@/lib/orchestration/introspection", () => ({
  __esModule: true,
  getAbilities: (category: string) =>
    (getAbilitiesMock as unknown as (c: string) => Promise<AbilitySnapshot>)(
      category,
    ),
}));

import { GET } from "../route";

function mkSnapshot(category: string): AbilitySnapshot {
  return {
    category,
    rubric: {
      name: category,
      description: "Test rubric",
      checks: [{ id: "c1", description: "check one" }],
    },
    provider: "gemini",
    toolCatalog: [
      { name: "read_file", description: "Reads", readOnlyAllowed: true },
      { name: "write_file", description: "Writes", readOnlyAllowed: false },
    ],
  };
}

function req(url: string): Request {
  return new Request(url, { method: "GET" });
}

beforeEach(() => {
  getAbilitiesMock.mockReset();
});

describe("GET /api/scion/abilities", () => {
  it("returns 400 when ?category is missing", async () => {
    const res = await GET(req("http://localhost/api/scion/abilities"));
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 400 when ?category is empty", async () => {
    const res = await GET(
      req("http://localhost/api/scion/abilities?category="),
    );
    expect(res.status).toBe(400);
  });

  it("returns 4_db rubric and tool catalog with readOnlyAllowed flags", async () => {
    getAbilitiesMock.mockResolvedValue(mkSnapshot("4_db"));
    const res = await GET(
      req("http://localhost/api/scion/abilities?category=4_db"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as AbilitySnapshot;
    expect(body.category).toBe("4_db");
    expect(body.rubric.name).toBe("4_db");
    expect(body.toolCatalog).toHaveLength(2);
    const rf = body.toolCatalog.find((t) => t.name === "read_file");
    const wf = body.toolCatalog.find((t) => t.name === "write_file");
    expect(rf?.readOnlyAllowed).toBe(true);
    expect(wf?.readOnlyAllowed).toBe(false);
    expect(getAbilitiesMock).toHaveBeenCalledWith("4_db");
  });

  it("returns 500 when introspection throws", async () => {
    getAbilitiesMock.mockRejectedValue(new Error("boom"));
    const res = await GET(
      req("http://localhost/api/scion/abilities?category=1_qa"),
    );
    expect(res.status).toBe(500);
  });
});
