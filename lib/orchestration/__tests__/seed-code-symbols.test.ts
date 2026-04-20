// Pass 24 — unit tests for scripts/seed-code-symbols.ts.
//
// Tests focus on the pure extraction / parsing helpers (no DB interaction).
// Dry-run mode is validated via a fixture directory containing two TS files
// with known exports.

import { describe, expect, it, beforeAll, afterAll } from "@jest/globals";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  extractSymbols,
  hashContent,
  parseArgs,
  runSeeder,
  walkFiles,
} from "@/scripts/seed-code-symbols";

describe("seed-code-symbols — parseArgs", () => {
  it("defaults to the four canonical roots", () => {
    const parsed = parseArgs([]);
    expect(parsed.paths).toEqual(["app", "components", "lib", "scripts"]);
    expect(parsed.reembed).toBe(false);
    expect(parsed.dryRun).toBe(false);
  });

  it("parses --paths space-separated value", () => {
    const parsed = parseArgs(["--paths", "lib,components"]);
    expect(parsed.paths).toEqual(["lib", "components"]);
  });

  it("parses --paths= equals form", () => {
    const parsed = parseArgs(["--paths=app,scripts"]);
    expect(parsed.paths).toEqual(["app", "scripts"]);
  });

  it("picks up --reembed and --dry-run flags", () => {
    const parsed = parseArgs(["--reembed", "--dry-run"]);
    expect(parsed.reembed).toBe(true);
    expect(parsed.dryRun).toBe(true);
  });
});

describe("seed-code-symbols — extractSymbols", () => {
  it("captures exported function, class, const, interface, type", () => {
    const src = [
      "/** First summary line. */",
      "export function foo(x: number): number { return x; }",
      "",
      "export class Bar { m() { return 1; } }",
      "export const BAZ = 42;",
      "export interface Qux { a: string }",
      "export type Quux = string | number;",
    ].join("\n");
    const syms = extractSymbols(src);
    const names = syms.map((s) => s.name);
    expect(names).toEqual(["foo", "Bar", "BAZ", "Qux", "Quux"]);
    expect(syms[0].kind).toBe("function");
    // JSDoc summary picked up.
    expect(syms[0].summary).toBe("First summary line.");
    expect(syms[1].kind).toBe("class");
    expect(syms[2].kind).toBe("const");
    expect(syms[3].kind).toBe("interface");
    expect(syms[4].kind).toBe("type");
  });

  it("ignores non-exported declarations", () => {
    const src = [
      "function hidden() {}",
      "class Secret {}",
      "export function visible() {}",
    ].join("\n");
    const syms = extractSymbols(src);
    expect(syms).toHaveLength(1);
    expect(syms[0].name).toBe("visible");
  });

  it("falls back to signature prefix when no JSDoc present", () => {
    const src = "export const answer = 42;";
    const syms = extractSymbols(src);
    expect(syms[0].summary).toContain("answer");
  });

  it("handles async exported functions", () => {
    const src = "export async function load(x: string) { return x; }";
    const syms = extractSymbols(src);
    expect(syms[0]?.name).toBe("load");
    expect(syms[0]?.kind).toBe("function");
  });
});

describe("seed-code-symbols — hashContent", () => {
  it("produces stable deterministic hex", () => {
    const a = hashContent("hello");
    const b = hashContent("hello");
    const c = hashContent("world");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(32);
  });
});

describe("seed-code-symbols — walkFiles + dry-run", () => {
  let fixtureRoot: string;

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "seeder-fixture-"));
    const libDir = path.join(fixtureRoot, "lib");
    await fs.mkdir(libDir, { recursive: true });
    await fs.writeFile(
      path.join(libDir, "a.ts"),
      [
        "/** alpha summary */",
        "export function alpha() { return 1; }",
        "export const BETA = 2;",
      ].join("\n"),
      "utf-8",
    );
    await fs.writeFile(
      path.join(libDir, "b.ts"),
      [
        "export class Gamma { do() { return 'x'; } }",
        "export interface Delta { n: number }",
        "export type Epsilon = number;",
      ].join("\n"),
      "utf-8",
    );
    // Decoy files that must be skipped.
    const testsDir = path.join(libDir, "__tests__");
    await fs.mkdir(testsDir, { recursive: true });
    await fs.writeFile(
      path.join(testsDir, "ignored.ts"),
      "export function ignored() {}",
      "utf-8",
    );
    await fs.writeFile(
      path.join(libDir, "a.test.ts"),
      "export function alsoIgnored() {}",
      "utf-8",
    );
  });

  afterAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it("walks only allowed files and skips __tests__/*.test.ts", async () => {
    const files = await walkFiles(path.join(fixtureRoot, "lib"));
    const rels = files.map((f) =>
      path.relative(fixtureRoot, f).replace(/\\/g, "/"),
    );
    expect(rels.sort()).toEqual(["lib/a.ts", "lib/b.ts"]);
  });

  it("dry-run produces exact expected summary counts without touching DB", async () => {
    const counts = await runSeeder(
      { paths: ["lib"], reembed: false, dryRun: true },
      fixtureRoot,
    );
    expect(counts.scanned).toBe(2);
    // a.ts exports 2 symbols (alpha, BETA); b.ts exports 3 (Gamma, Delta, Epsilon).
    expect(counts.extracted).toBe(5);
    expect(counts.upserted).toBe(0);
    expect(counts.skipped).toBe(0);
  });
});
