// SCION routines collection endpoint.
//
// GET  /api/scion/routines
//   Lists every Routine row, most-recently-updated first. Open to any
//   authenticated SCION viewer — same read contract as /api/scion/goals.
//
// POST /api/scion/routines
//   Admin-only. Body: { cronExpression: string, taskPayload: string | object,
//   isActive?: boolean }. Validates that cronExpression parses as a classic
//   5-field crontab (minute hour dom month dow). Validates that taskPayload
//   (accepted as a JSON string OR an object) parses into JSON with at least
//   `{agentName, instruction}` — the ExecuteDialog payload shape. Persists
//   `taskPayload` as a stringified JSON blob (per the Prisma model).
//   Audit-logged.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";

export interface ScionRoutineRow {
  id: string;
  cronExpression: string;
  taskPayload: string;
  isActive: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScionRoutinesResponse {
  routines: ScionRoutineRow[];
}

export interface ScionRoutineCreateResponse {
  routine: ScionRoutineRow;
}

// ---------------------------------------------------------------------------
// Validation helpers

/**
 * Validate a classic 5-field crontab expression:
 *   minute hour dom month dow
 *
 * We keep this validator intentionally lightweight: exactly five
 * space-separated, non-empty tokens, with each token only containing the
 * characters `0-9 , - * / ?` and a few named aliases (`JAN`..`DEC`,
 * `SUN`..`SAT`, `MON`..`FRI`). This rejects obvious garbage ("every
 * minute pls"), 6/7-field quartz-style expressions, and shorthand like
 * `@hourly` — the Prisma field comment is explicit about the 5-field
 * shape, and the registered cron runner in this repo also assumes 5 fields.
 */
const CRON_TOKEN = /^[0-9*/,\-?A-Z]+$/i;

export function isValidCronExpression(expr: string): boolean {
  if (typeof expr !== "string") return false;
  const trimmed = expr.trim();
  if (trimmed.length === 0) return false;
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) return false;
  for (const field of fields) {
    if (field.length === 0) return false;
    if (!CRON_TOKEN.test(field)) return false;
  }
  return true;
}

export interface ParsedTaskPayload {
  agentName: string;
  instruction: string;
  [key: string]: unknown;
}

/**
 * Accept either a raw object or a JSON-encoded string. Normalises to a
 * parsed object with the required `agentName` + `instruction` fields and
 * returns null on any failure.
 */
export function parseTaskPayload(raw: unknown): ParsedTaskPayload | null {
  let candidate: unknown = raw;
  if (typeof raw === "string") {
    try {
      candidate = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const obj = candidate as Record<string, unknown>;
  const agentName =
    typeof obj.agentName === "string" ? obj.agentName.trim() : "";
  const instruction =
    typeof obj.instruction === "string" ? obj.instruction.trim() : "";
  if (agentName.length === 0 || instruction.length === 0) return null;
  return { ...obj, agentName, instruction };
}

// ---------------------------------------------------------------------------
// Handlers

function toRow(r: {
  id: string;
  cronExpression: string;
  taskPayload: string;
  isActive: boolean;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ScionRoutineRow {
  return {
    id: r.id,
    cronExpression: r.cronExpression,
    taskPayload: r.taskPayload,
    isActive: r.isActive,
    lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const rows = await prisma.routine.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    const body: ScionRoutinesResponse = { routines: rows.map(toRow) };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "routines list failed";
    console.error("/api/scion/routines GET error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  let body: {
    cronExpression?: unknown;
    taskPayload?: unknown;
    isActive?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const cronExpression =
    typeof body.cronExpression === "string" ? body.cronExpression.trim() : "";
  if (!isValidCronExpression(cronExpression)) {
    return NextResponse.json(
      {
        error:
          "cronExpression must be 5 space-separated fields (minute hour dom month dow)",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = parseTaskPayload(body.taskPayload);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "taskPayload must be JSON with at least { agentName, instruction } as non-empty strings",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

  try {
    const stored = JSON.stringify(parsed);
    const created = await prisma.routine.create({
      data: {
        cronExpression,
        taskPayload: stored,
        isActive,
      },
    });
    await recordAdminAction(user, "routine.create", {
      routineId: created.id,
      cronExpression,
      agentName: parsed.agentName,
      isActive,
    });
    const response: ScionRoutineCreateResponse = { routine: toRow(created) };
    return NextResponse.json(response, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "routine create failed";
    console.error("/api/scion/routines POST error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
