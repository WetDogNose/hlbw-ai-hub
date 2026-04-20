// Pass 22 — fetch container logs.
//
// GET /api/scion/workers/[name]/logs
// Shells out to `docker logs --tail <n> <name>`. Container name must match
// `CONTAINER_NAME_PATTERN` to prevent injection. Admin-only.

import { NextResponse } from "next/server";
import { spawnSync } from "node:child_process";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import { isValidContainerName } from "@/lib/orchestration/container-names";

const DEFAULT_TAIL = 200;
const MAX_TAIL = 2000;

export interface ScionWorkerLogsResponse {
  name: string;
  tail: number;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function GET(
  req: Request,
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

  const url = new URL(req.url);
  const tailRaw = url.searchParams.get("tail");
  let tail = DEFAULT_TAIL;
  if (tailRaw !== null) {
    const parsed = Number.parseInt(tailRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      tail = Math.min(parsed, MAX_TAIL);
    }
  }

  try {
    const result = spawnSync("docker", ["logs", "--tail", String(tail), name], {
      encoding: "utf8",
      timeout: 10_000,
    });
    await recordAdminAction(user, "worker.logs", { name, tail });
    const body: ScionWorkerLogsResponse = {
      name,
      tail,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.status,
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "logs failed";
    console.error("/api/scion/workers/[name]/logs error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
