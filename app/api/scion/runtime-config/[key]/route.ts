// Pass 23 — PUT /api/scion/runtime-config/[key]
//
// Body: { value: unknown }
// Validates via `setRuntimeConfig` (per-key schema). 400 on invalid payload.
// Admin-only. Audited via `recordAdminAction`.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import {
  RUNTIME_CONFIG_KEYS,
  setRuntimeConfig,
  type RuntimeConfigKey,
} from "@/lib/orchestration/runtime-config";

function isRuntimeConfigKey(k: string): k is RuntimeConfigKey {
  return (RUNTIME_CONFIG_KEYS as ReadonlyArray<string>).includes(k);
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ key: string }> } | { params: { key: string } },
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  const paramsMaybePromise = (context as { params: unknown }).params;
  const params =
    paramsMaybePromise instanceof Promise
      ? await paramsMaybePromise
      : (paramsMaybePromise as { key: string });
  const key = params.key;
  if (!key || typeof key !== "string" || !isRuntimeConfigKey(key)) {
    return NextResponse.json(
      { error: "unknown runtime config key" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: { value?: unknown };
  try {
    body =
      ((await req.json().catch(() => null)) as {
        value?: unknown;
      } | null) ?? {};
  } catch {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!("value" in body)) {
    return NextResponse.json(
      { error: "body must include `value`" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await setRuntimeConfig(key, body.value, user.email ?? "unknown");
    await recordAdminAction(user, "runtime-config.set", {
      key,
      value: body.value,
    });
    return NextResponse.json(
      { ok: true, key },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "set failed";
    if (message.startsWith("invalid value for key")) {
      return NextResponse.json(
        { error: message },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("/api/scion/runtime-config/[key] error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
