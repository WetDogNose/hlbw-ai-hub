// Pass 22 — Admin auth guard for SCION operational write routes.
//
// Every mutation route under `app/api/scion/*` (other than the GET read-only
// routes registered in pass 21) calls `requireAdmin()` as its first line. The
// helper returns either:
//   - an `IapUser` with `role === "ADMIN"` (proceed), or
//   - a `NextResponse` 401/403 (return directly from the route).
//
// Callers discriminate via the `"status" in result` check — NextResponse has
// a `status` property; IapUser does not.
//
// Rationale:
//   - Centralising the pattern keeps admin-gating uniform across all write
//     routes. Drift between routes is the usual failure mode.
//   - No new dep; reuses `getIapUser` from `lib/iap-auth.ts`.

import { getIapUser, type IapUser } from "@/lib/iap-auth";
import { NextResponse } from "next/server";

export async function requireAdmin(): Promise<IapUser | NextResponse> {
  const user = await getIapUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return user;
}
