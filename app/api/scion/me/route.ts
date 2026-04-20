// Pass 22 — SCION current-user chip.
//
// GET /api/scion/me
// Returns the authenticated `IapUser` from `getIapUser()`. Admin-only: the
// UserChip sits inside the SCION dashboard which is already admin-scoped;
// returning a trimmed record to USER would leak role semantics. Non-admin
// (including unauthenticated) → 401/403 via `requireAdmin()`.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import type { IapUser } from "@/lib/iap-auth";

export interface ScionMeResponse {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
}

export async function GET(): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user: IapUser = guard;
  const body: ScionMeResponse = {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    role: user.role,
  };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
