// Pass 22 — restart a container.
//
// POST /api/scion/workers/[name]/restart
// Shells out to `docker restart <name>`. Name validated. Admin-only.

import { NextResponse } from "next/server";
import { spawnSync } from "node:child_process";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import { isValidContainerName } from "@/lib/orchestration/container-names";

export async function POST(
  _req: Request,
  context: { params: Promise<{ name: string }> } | { params: { name: string } },
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  const paramsMaybePromise = (context as { params: unknown }).params;
  const params =
    paramsMaybePromise instanceof Promise
      ? await paramsMaybePromise
      : (paramsMaybePromise as { name: string });
  const name = params.name;
  if (!isValidContainerName(name)) {
    return NextResponse.json(
      { error: "invalid container name" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = spawnSync("docker", ["restart", name], {
      encoding: "utf8",
      timeout: 30_000,
    });
    await recordAdminAction(user, "worker.restart", {
      name,
      exitCode: result.status,
    });
    return NextResponse.json(
      {
        ok: result.status === 0,
        name,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.status,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "restart failed";
    console.error("/api/scion/workers/[name]/restart error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
