// Pass 23 — GET /api/scion/runtime-config
//
// Returns effective values for every enumerated runtime-config key. Admin-only
// (mirrors the write side so non-admins don't enumerate operational knobs).

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import {
  listRuntimeConfig,
  type RuntimeConfigEffective,
  type RuntimeConfigKey,
} from "@/lib/orchestration/runtime-config";

export interface ScionRuntimeConfigResponse {
  entries: RuntimeConfigEffective<RuntimeConfigKey>[];
}

export async function GET(): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  try {
    const entries = await listRuntimeConfig();
    const body: ScionRuntimeConfigResponse = { entries };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal Server Error";
    console.error("/api/scion/runtime-config error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
