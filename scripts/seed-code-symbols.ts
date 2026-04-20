// Pass 24 — Symbol seeder for the PgvectorCodeIndex.
//
// Walks configured roots (`app`, `components`, `lib`, `scripts` by default)
// for `.ts` / `.tsx` files, extracts exported symbols via a lightweight
// regex-based scanner, and upserts each symbol into the code index with an
// embedding of its summary. Incremental: each file's SHA-256 content hash is
// stored in the entity payload and used as a skip gate on subsequent runs.
//
// CLI:
//   npx tsx scripts/seed-code-symbols.ts
//   npx tsx scripts/seed-code-symbols.ts --paths lib,components
//   npx tsx scripts/seed-code-symbols.ts --reembed
//   npx tsx scripts/seed-code-symbols.ts --dry-run
//
// Progress lines (parsed by /api/scion/code-index/seed):
//   [seeder] scanned N files, extracted M symbols, upserted K, skipped S (hash unchanged)
//
// The seeder does NOT import from `lib/` via `@/` path alias directly; it
// uses relative paths so `npx tsx` resolves everything from repo root.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { Prisma } from "@prisma/client";
import { createEmbeddingProvider } from "../lib/orchestration/embeddings";
import { PgvectorCodeIndex } from "../lib/orchestration/code-index/PgvectorCodeIndex";
import { getPgvectorMemoryStore } from "../lib/orchestration/memory/PgvectorMemoryStore";
import type {
  CodeSymbol,
  CodeSymbolKind,
} from "../lib/orchestration/code-index";
import prisma from "../lib/prisma";

// ---------------------------------------------------------------------------
// CLI arg parsing.
// ---------------------------------------------------------------------------

export interface SeederArgs {
  paths: string[];
  reembed: boolean;
  dryRun: boolean;
}

export function parseArgs(argv: string[]): SeederArgs {
  let paths: string[] = ["app", "components", "lib", "scripts"];
  let reembed = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--paths") {
      const next = argv[i + 1];
      if (typeof next === "string" && next.length > 0) {
        paths = next
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
      }
      i += 1;
    } else if (arg.startsWith("--paths=")) {
      paths = arg
        .slice("--paths=".length)
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    } else if (arg === "--reembed") {
      reembed = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }
  return { paths, reembed, dryRun };
}

// ---------------------------------------------------------------------------
// File walk.
// ---------------------------------------------------------------------------

const EXCLUDED_DIRS = new Set([
  "__tests__",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".git",
]);

const ALLOWED_EXT = new Set([".ts", ".tsx"]);

/**
 * Recursive directory walk. Returns absolute file paths for `.ts` / `.tsx`
 * files beneath `root`, excluding conventional build/test output dirs.
 */
export async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) break;
    let entries: Array<{ name: string; isDir: boolean; isFile: boolean }>;
    try {
      const raw = await fs.readdir(dir, { withFileTypes: true });
      entries = raw.map((e) => ({
        name: e.name,
        isDir: e.isDirectory(),
        isFile: e.isFile(),
      }));
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDir) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        stack.push(path.join(dir, entry.name));
      } else if (entry.isFile) {
        const ext = path.extname(entry.name);
        if (ALLOWED_EXT.has(ext)) {
          // Skip declaration files and test files defensively — the exclusion
          // above handles __tests__, but *.test.ts can live alongside source.
          if (entry.name.endsWith(".d.ts")) continue;
          if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
          out.push(path.join(dir, entry.name));
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Symbol extraction — regex fallback.
// ---------------------------------------------------------------------------
//
// The AST analyzer MCP at `.agents/mcp-servers/ast-analyzer/` is the
// authoritative extractor; spawning it via stdio per-file is O(N) on MCP
// startup cost and unnecessary for a maintenance seeder. This module uses a
// lightweight regex scanner instead: every `^export …` line becomes a
// CodeSymbol. The signature is the first line of the declaration.
//
// The regex is intentionally conservative. Non-exported symbols are skipped
// (they aren't useful for the context-builder's "public surface" retrieval).

const EXPORT_PATTERNS: Array<{ re: RegExp; kind: CodeSymbolKind }> = [
  {
    re: /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*/,
    kind: "function",
  },
  { re: /^export\s+class\s+([A-Za-z_$][\w$]*)\s*/, kind: "class" },
  { re: /^export\s+interface\s+([A-Za-z_$][\w$]*)\s*/, kind: "interface" },
  { re: /^export\s+type\s+([A-Za-z_$][\w$]*)\s*/, kind: "type" },
  { re: /^export\s+const\s+([A-Za-z_$][\w$]*)\s*/, kind: "const" },
  { re: /^export\s+let\s+([A-Za-z_$][\w$]*)\s*/, kind: "const" },
  { re: /^export\s+enum\s+([A-Za-z_$][\w$]*)\s*/, kind: "type" },
  {
    re: /^export\s+default\s+(?:async\s+)?(?:function|class)?\s*([A-Za-z_$][\w$]*)?/,
    kind: "function",
  },
];

export interface ExtractedSymbol {
  name: string;
  kind: CodeSymbolKind;
  summary: string;
  signature: string;
}

/**
 * Extract all exported symbols from a single source file content.
 *
 * The summary is the first JSDoc line (if a `/** ... *\/` block precedes the
 * export), otherwise the first 140 chars of the signature line.
 */
export function extractSymbols(source: string): ExtractedSymbol[] {
  const lines = source.split(/\r?\n/);
  const out: ExtractedSymbol[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of EXPORT_PATTERNS) {
      const m = pattern.re.exec(line);
      if (!m) continue;
      const name = m[1];
      if (!name) {
        // `export default` with no trailing identifier — skip; rare.
        continue;
      }
      // JSDoc lookback: walk up past blank lines until we find `*/`; if
      // found, take the first line of the block after `/**`.
      const jsdocSummary = findJsdocSummary(lines, i);
      const signature = line.trim().slice(0, 200);
      const summary =
        jsdocSummary !== null ? jsdocSummary : signature.slice(0, 140);
      out.push({ name, kind: pattern.kind, summary, signature });
      break; // one export pattern per line
    }
  }
  return out;
}

function findJsdocSummary(lines: string[], exportIndex: number): string | null {
  // Walk up: allow leading whitespace; skip blank lines.
  let j = exportIndex - 1;
  while (j >= 0 && lines[j].trim().length === 0) j -= 1;
  if (j < 0 || !lines[j].trimEnd().endsWith("*/")) return null;
  // Find the opening `/**`.
  let start = j;
  while (start >= 0 && !lines[start].trimStart().startsWith("/**")) start -= 1;
  if (start < 0) return null;
  // Join middle lines, strip leading `*`, take the first non-empty sentence.
  const body = lines
    .slice(start + 1, j)
    .map((l) => l.replace(/^\s*\*\s?/, ""))
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (body.length === 0) {
    // All-one-line JSDoc `/** foo */`.
    const oneLine = lines[start]
      .replace(/^\s*\/\*\*\s*/, "")
      .replace(/\s*\*\/\s*$/, "")
      .trim();
    return oneLine.length > 0 ? oneLine.slice(0, 200) : null;
  }
  return body[0].slice(0, 200);
}

// ---------------------------------------------------------------------------
// Hashing.
// ---------------------------------------------------------------------------

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// File-hash skip gate.
// ---------------------------------------------------------------------------
//
// The entity payload persisted by `PgvectorCodeIndex.upsert` has shape
// { symbolId, path, name, symbolKind, signature }. To make the seeder
// incremental we piggyback on the same `memory_episode` rows and ALSO store
// a lightweight per-file marker episode:
//   kind="entity" summary="file-hash:<relPath>" content={ marker:"file-hash", relPath, hash }
// On subsequent runs we look up the marker for the file and skip if unchanged.

interface FileHashMarker {
  marker: "file-hash";
  relPath: string;
  hash: string;
}

function isFileHashMarker(v: unknown): v is FileHashMarker {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    o.marker === "file-hash" &&
    typeof o.relPath === "string" &&
    typeof o.hash === "string"
  );
}

async function readFileHashMarker(relPath: string): Promise<string | null> {
  try {
    const rows = await prisma.memoryEpisode.findMany({
      where: {
        kind: "entity",
        summary: `file-hash:${relPath}`,
      },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { content: true },
    });
    if (rows.length === 0) return null;
    const c = rows[0].content as unknown;
    if (isFileHashMarker(c)) return c.hash;
    return null;
  } catch {
    return null;
  }
}

async function writeFileHashMarker(
  relPath: string,
  hash: string,
): Promise<void> {
  try {
    // Keep a single up-to-date marker row: delete prior rows for this path.
    await prisma.memoryEpisode.deleteMany({
      where: {
        kind: "entity",
        summary: `file-hash:${relPath}`,
      },
    });
  } catch {
    // Table-missing / transient — swallow; marker write below will error out.
  }
  const markerContent = {
    marker: "file-hash",
    relPath,
    hash,
  } satisfies FileHashMarker;
  await prisma.memoryEpisode.create({
    data: {
      taskId: null,
      kind: "entity",
      agentCategory: null,
      content: markerContent as Prisma.InputJsonValue,
      summary: `file-hash:${relPath}`,
    },
  });
}

// ---------------------------------------------------------------------------
// Main entry.
// ---------------------------------------------------------------------------

export interface SeederCounts {
  scanned: number;
  extracted: number;
  upserted: number;
  skipped: number;
}

export async function runSeeder(
  args: SeederArgs,
  repoRoot: string = process.cwd(),
): Promise<SeederCounts> {
  const counts: SeederCounts = {
    scanned: 0,
    extracted: 0,
    upserted: 0,
    skipped: 0,
  };

  // Collect files.
  const files: string[] = [];
  for (const rel of args.paths) {
    const abs = path.join(repoRoot, rel);
    try {
      const stat = await fs.stat(abs);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }
    const found = await walkFiles(abs);
    files.push(...found);
  }
  counts.scanned = files.length;

  if (args.dryRun) {
    // Count extracted symbols across all files without touching the DB.
    for (const abs of files) {
      let content: string;
      try {
        content = await fs.readFile(abs, "utf-8");
      } catch {
        continue;
      }
      const symbols = extractSymbols(content);
      counts.extracted += symbols.length;
    }
    console.log(
      `[seeder] scanned ${counts.scanned} files, extracted ${counts.extracted} symbols, upserted 0, skipped 0 (dry-run)`,
    );
    return counts;
  }

  const embeddings = createEmbeddingProvider();
  const memory = getPgvectorMemoryStore();
  const codeIndex = new PgvectorCodeIndex(memory);

  for (const abs of files) {
    let content: string;
    try {
      content = await fs.readFile(abs, "utf-8");
    } catch {
      continue;
    }
    const relPath = path.relative(repoRoot, abs).replace(/\\/g, "/");
    const fileHash = hashContent(content);

    if (!args.reembed) {
      const prev = await readFileHashMarker(relPath);
      if (prev === fileHash) {
        counts.skipped += 1;
        continue;
      }
    }

    const symbols = extractSymbols(content);
    counts.extracted += symbols.length;
    if (symbols.length === 0) {
      // Still write a marker so an empty file doesn't re-scan every run.
      await writeFileHashMarker(relPath, fileHash);
      continue;
    }

    // Embed summaries in a single batch per file.
    const summaries = symbols.map((s) => s.summary);
    let vectors: number[][];
    try {
      vectors = await embeddings.embed(summaries);
    } catch (err) {
      console.warn(
        `[seeder] embed failure for ${relPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    for (let i = 0; i < symbols.length; i++) {
      const s = symbols[i];
      const vec = vectors[i];
      if (!vec || vec.length === 0) continue;
      const symbol: CodeSymbol = {
        id: `${relPath}#${s.name}`,
        path: relPath,
        name: s.name,
        kind: s.kind,
        summary: s.summary,
        signature: s.signature,
      };
      try {
        await codeIndex.upsert(symbol, vec);
        counts.upserted += 1;
      } catch (err) {
        console.warn(
          `[seeder] upsert failure ${symbol.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    await writeFileHashMarker(relPath, fileHash);
  }

  console.log(
    `[seeder] scanned ${counts.scanned} files, extracted ${counts.extracted} symbols, upserted ${counts.upserted}, skipped ${counts.skipped} (hash unchanged)`,
  );
  return counts;
}

// ---------------------------------------------------------------------------
// CLI invocation.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  try {
    await runSeeder(args);
  } catch (err) {
    console.error(
      `[seeder] fatal: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  }
}

// Only run when invoked directly, not when imported for tests.
const isDirect =
  typeof require !== "undefined" && require.main === (module as NodeJS.Module);
if (isDirect) {
  void main();
}
