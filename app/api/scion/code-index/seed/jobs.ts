// Pass 24 — in-memory job map for the code-index seeder.
//
// POST /api/scion/code-index/seed spawns `scripts/seed-code-symbols.ts` as a
// detached child process and writes status + parsed counts here. GET
// /api/scion/code-index/seed/[jobId] reads the same map.
//
// Jobs are non-durable across Next.js process restart by design (same
// rationale as `pool/restart/jobs.ts`).

export interface SeedJobCounts {
  scanned: number;
  extracted: number;
  upserted: number;
  skipped: number;
}

export interface SeedJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  finishedAt?: string;
  counts: SeedJobCounts;
  exitCode?: number | null;
  error?: string;
  stderrTail?: string;
  paths: string[];
  reembed: boolean;
  dryRun: boolean;
}

export const seedJobs: Map<string, SeedJob> = new Map();

// Track the most recently created job id so the UI can show a "last run"
// summary without a separate query param.
export const seedJobsState: { lastJobId: string | null } = {
  lastJobId: null,
};

export function newSeedJobId(): string {
  return `seed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Parse a single seeder progress line of the form:
//   [seeder] scanned 12 files, extracted 34 symbols, upserted 30, skipped 2 (hash unchanged)
// Returns an updated counts object on match, or `null` otherwise.
export function parseSeederProgressLine(line: string): SeedJobCounts | null {
  const re =
    /scanned\s+(\d+)\s+files.*?extracted\s+(\d+)\s+symbols.*?upserted\s+(\d+).*?skipped\s+(\d+)/;
  const m = re.exec(line);
  if (!m) return null;
  return {
    scanned: Number.parseInt(m[1], 10),
    extracted: Number.parseInt(m[2], 10),
    upserted: Number.parseInt(m[3], 10),
    skipped: Number.parseInt(m[4], 10),
  };
}
