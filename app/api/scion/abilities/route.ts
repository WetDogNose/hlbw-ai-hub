// Pass 21 — SCION abilities endpoint.
//
// GET /api/scion/abilities?category=<string>
// Returns AbilitySnapshot: per-category rubric, provider, tool catalog with
// read-only-allowed flag. Category is mandatory (400 if missing).

import { NextResponse } from "next/server";
import {
  getAbilities,
  type AbilitySnapshot,
} from "@/lib/orchestration/introspection";

export type ScionAbilitiesResponse = AbilitySnapshot;

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  if (!category || category.trim() === "") {
    return NextResponse.json(
      { error: "category query parameter required" },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  try {
    const snapshot = await getAbilities(category);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/abilities error:", error);
    return NextResponse.json(
      { error: message },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
