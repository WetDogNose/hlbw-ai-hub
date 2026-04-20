// Pass 21 — SCION config introspection endpoint.
//
// GET /api/scion/config
// Returns ConfigSnapshot (see lib/orchestration/introspection.ts).
// Secrets never leave the server: envSanity reports presence booleans only.

import { NextResponse } from "next/server";
import {
  getConfigSnapshot,
  type ConfigSnapshot,
} from "@/lib/orchestration/introspection";

export type ScionConfigResponse = ConfigSnapshot;

export async function GET(): Promise<NextResponse> {
  try {
    const snapshot = await getConfigSnapshot();
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/config error:", error);
    return NextResponse.json(
      { error: message },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
