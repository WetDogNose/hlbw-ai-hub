// Pass 23 — GET /api/scion/budget
//
// Aggregates `BudgetLedger` rows by task / model / day. Admin-only.
//
//   ?groupBy=task   → GROUP BY "issueId"        (label = issue id or "unassigned")
//   ?groupBy=model  → GROUP BY agentId.role     (proxy for provider family —
//                      BudgetLedger has no model column per checkpoint-15 notes)
//   ?groupBy=day    → GROUP BY date_trunc('day', timestamp)
//   ?from=ISO8601   → filter timestamp >= from
//   ?to=ISO8601     → filter timestamp <  to
//
// Response: `{ groupBy, rows: Array<{ label, totalTokens, totalCalls }> }`.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";

export type BudgetGroupBy = "task" | "model" | "day";

export interface BudgetBreakdownRow {
  label: string;
  totalTokens: number;
  totalCalls: number;
}

export interface ScionBudgetResponse {
  groupBy: BudgetGroupBy;
  rows: BudgetBreakdownRow[];
}

const ALLOWED: ReadonlyArray<BudgetGroupBy> = ["task", "model", "day"];

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const url = new URL(req.url);
  const groupByRaw = url.searchParams.get("groupBy") ?? "task";
  if (!(ALLOWED as ReadonlyArray<string>).includes(groupByRaw)) {
    return NextResponse.json(
      { error: "groupBy must be one of task|model|day" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const groupBy = groupByRaw as BudgetGroupBy;

  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  const filters: Prisma.Sql[] = [];
  if (from) filters.push(Prisma.sql`bl."timestamp" >= ${from}`);
  if (to) filters.push(Prisma.sql`bl."timestamp" < ${to}`);
  const whereSql =
    filters.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`
      : Prisma.empty;

  type RawRow = {
    label: string | null;
    total_tokens: bigint | number | null;
    total_calls: bigint | number | null;
  };

  try {
    let raw: RawRow[] = [];
    if (groupBy === "task") {
      raw = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
        SELECT
          COALESCE(bl."issueId", 'unassigned') AS label,
          SUM(bl."tokensUsed")::bigint AS total_tokens,
          COUNT(*)::bigint AS total_calls
        FROM "BudgetLedger" bl
        ${whereSql}
        GROUP BY COALESCE(bl."issueId", 'unassigned')
        ORDER BY total_tokens DESC
        LIMIT 200
      `);
    } else if (groupBy === "model") {
      raw = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
        SELECT
          COALESCE(ap."role", 'unknown') AS label,
          SUM(bl."tokensUsed")::bigint AS total_tokens,
          COUNT(*)::bigint AS total_calls
        FROM "BudgetLedger" bl
        LEFT JOIN "AgentPersona" ap ON ap."id" = bl."agentId"
        ${whereSql}
        GROUP BY COALESCE(ap."role", 'unknown')
        ORDER BY total_tokens DESC
        LIMIT 200
      `);
    } else {
      // day
      raw = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
        SELECT
          to_char(date_trunc('day', bl."timestamp"), 'YYYY-MM-DD') AS label,
          SUM(bl."tokensUsed")::bigint AS total_tokens,
          COUNT(*)::bigint AS total_calls
        FROM "BudgetLedger" bl
        ${whereSql}
        GROUP BY date_trunc('day', bl."timestamp")
        ORDER BY date_trunc('day', bl."timestamp") DESC
        LIMIT 180
      `);
    }

    const rows: BudgetBreakdownRow[] = raw.map((r) => ({
      label: r.label ?? "unknown",
      totalTokens:
        typeof r.total_tokens === "bigint"
          ? Number(r.total_tokens)
          : (r.total_tokens ?? 0),
      totalCalls:
        typeof r.total_calls === "bigint"
          ? Number(r.total_calls)
          : (r.total_calls ?? 0),
    }));

    const body: ScionBudgetResponse = { groupBy, rows };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "budget query failed";
    console.error("/api/scion/budget error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
