// Pass 12 — Rubric registry unit tests.
//
// Verifies:
//   - loadRubric("1_qa") returns the QA rubric (same object identity).
//   - loadRubric("nonexistent") falls back to DEFAULT_RUBRIC.
//   - loadRubric(null) falls back to DEFAULT_RUBRIC.
//   - loadRubric(undefined) falls back to DEFAULT_RUBRIC.
//   - loadRubric("") falls back to DEFAULT_RUBRIC.
//   - Each of the six built-in rubrics has >= 3 checks.
//
// Run via `npx jest scripts/swarm/roles/__tests__/rubric-registry.test.ts`.

import { describe, expect, it } from "@jest/globals";

import {
  BIZOPS_RUBRIC,
  CLOUD_RUBRIC,
  DB_RUBRIC,
  DEFAULT_RUBRIC,
  QA_RUBRIC,
  SOURCE_CONTROL_RUBRIC,
  loadRubric,
} from "@/lib/orchestration/rubrics";

describe("loadRubric", () => {
  it('returns the QA rubric for category "1_qa"', () => {
    expect(loadRubric("1_qa")).toBe(QA_RUBRIC);
  });

  it('returns the source-control rubric for category "2_source_control"', () => {
    expect(loadRubric("2_source_control")).toBe(SOURCE_CONTROL_RUBRIC);
  });

  it('returns the cloud rubric for category "3_cloud"', () => {
    expect(loadRubric("3_cloud")).toBe(CLOUD_RUBRIC);
  });

  it('returns the DB rubric for category "4_db"', () => {
    expect(loadRubric("4_db")).toBe(DB_RUBRIC);
  });

  it('returns the bizops rubric for category "5_bizops"', () => {
    expect(loadRubric("5_bizops")).toBe(BIZOPS_RUBRIC);
  });

  it("returns DEFAULT_RUBRIC for unknown category", () => {
    expect(loadRubric("nonexistent")).toBe(DEFAULT_RUBRIC);
  });

  it("returns DEFAULT_RUBRIC for null", () => {
    expect(loadRubric(null)).toBe(DEFAULT_RUBRIC);
  });

  it("returns DEFAULT_RUBRIC for undefined", () => {
    expect(loadRubric(undefined)).toBe(DEFAULT_RUBRIC);
  });

  it("returns DEFAULT_RUBRIC for empty string", () => {
    expect(loadRubric("")).toBe(DEFAULT_RUBRIC);
  });

  it('returns DEFAULT_RUBRIC when explicitly asked for "default"', () => {
    expect(loadRubric("default")).toBe(DEFAULT_RUBRIC);
  });
});

describe("rubric contents", () => {
  const all = [
    DEFAULT_RUBRIC,
    QA_RUBRIC,
    SOURCE_CONTROL_RUBRIC,
    CLOUD_RUBRIC,
    DB_RUBRIC,
    BIZOPS_RUBRIC,
  ];

  it("every rubric has a non-empty name and description", () => {
    for (const r of all) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(0);
    }
  });

  it("every rubric has >= 3 checks", () => {
    for (const r of all) {
      expect(r.checks.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("every check id is a non-empty snake_case-ish string", () => {
    for (const r of all) {
      for (const c of r.checks) {
        expect(c.id.length).toBeGreaterThan(0);
        expect(c.description.length).toBeGreaterThan(0);
        // Symbol-grounding: ids must be meaningful identifiers, not
        // generic placeholders like "check1".
        expect(c.id).not.toMatch(/^check\d+$/);
      }
    }
  });

  it("rubric names match their registry keys", () => {
    expect(DEFAULT_RUBRIC.name).toBe("default");
    expect(QA_RUBRIC.name).toBe("1_qa");
    expect(SOURCE_CONTROL_RUBRIC.name).toBe("2_source_control");
    expect(CLOUD_RUBRIC.name).toBe("3_cloud");
    expect(DB_RUBRIC.name).toBe("4_db");
    expect(BIZOPS_RUBRIC.name).toBe("5_bizops");
  });
});
