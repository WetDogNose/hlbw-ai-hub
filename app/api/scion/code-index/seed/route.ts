// Pass 24 — POST /api/scion/code-index/seed
//
// Body (optional): { paths?: string[]; reembed?: boolean; dryRun?: boolean }
// Admin-only; audited. Spawns `scripts/seed-code-symbols.ts` as a detached
// child process. Returns 202 + { jobId }. The job's counts / status are
// updated from the seeder's stdout progress line (parsed via
// `parseSeederProgressLine`).

import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import {
  newSeedJobId,
  parseSeederProgressLine,
  seedJobs,
  seedJobsState,
  type SeedJob,
} from "./jobs";

export interface SeedRequestBody {
  paths?: string[];
  reembed?: boolean;
  dryRun?: boolean;
}

export interface SeedResponse {
  jobId: string;
  status: SeedJob["status"];
  startedAt: string;
}

const STDERR_TAIL_LIMIT = 4_000;

function sanitizePaths(paths: unknown): string[] | null {
  if (paths === undefined) return null;
  if (!Array.isArray(paths)) return null;
  const out: string[] = [];
  for (const p of paths) {
    if (typeof p !== "string") return null;
    const trimmed = p.trim();
    if (trimmed.length === 0) continue;
    // Paths are passed into `--paths a,b,c` — refuse anything with `..`, `/`, `\`,
    // commas, or leading dots to keep the seeder scoped to repo subdirs.
    if (/[,\\/]/.test(trimmed)) return null;
    if (trimmed.startsWith(".") || trimmed.includes("..")) return null;
    out.push(trimmed);
  }
  return out;
}

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  let body: SeedRequestBody;
  try {
    body = ((await req.json().catch(() => null)) as SeedRequestBody) ?? {};
  } catch {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let paths: string[] = ["app", "components", "lib", "scripts"];
  if (body.paths !== undefined) {
    const clean = sanitizePaths(body.paths);
    if (clean === null) {
      return NextResponse.json(
        { error: "invalid paths" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (clean.length > 0) paths = clean;
  }
  const reembed = body.reembed === true;
  const dryRun = body.dryRun === true;

  const jobId = newSeedJobId();
  const startedAt = new Date().toISOString();
  const job: SeedJob = {
    id: jobId,
    status: "running",
    startedAt,
    counts: { scanned: 0, extracted: 0, upserted: 0, skipped: 0 },
    paths,
    reembed,
    dryRun,
  };
  seedJobs.set(jobId, job);
  seedJobsState.lastJobId = jobId;

  try {
    const repoRoot = process.cwd();
    const scriptPath = path.join(repoRoot, "scripts", "seed-code-symbols.ts");
    const args = ["tsx", scriptPath, "--paths", paths.join(",")];
    if (reembed) args.push("--reembed");
    if (dryRun) args.push("--dry-run");

    const child = spawn("npx", args, {
      cwd: repoRoot,
      env: process.env,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split(/\r?\n/)) {
        const parsed = parseSeederProgressLine(line);
        if (parsed) job.counts = parsed;
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > STDERR_TAIL_LIMIT) {
        stderr = stderr.slice(-STDERR_TAIL_LIMIT);
      }
      job.stderrTail = stderr;
    });
    child.on("exit", (code) => {
      job.status = code === 0 ? "completed" : "failed";
      job.finishedAt = new Date().toISOString();
      job.exitCode = code;
      if (code !== 0) {
        job.error = stderr || `seeder exited with code ${code ?? "?"}`;
      }
    });
    child.on("error", (err: Error) => {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = err.message;
    });

    await recordAdminAction(user, "code-index.seed", {
      jobId,
      paths,
      reembed,
      dryRun,
    });
    const response: SeedResponse = {
      jobId,
      status: job.status,
      startedAt,
    };
    return NextResponse.json(response, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "spawn failed";
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.error = message;
    console.error("/api/scion/code-index/seed error:", err);
    return NextResponse.json(
      { error: message, jobId },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
