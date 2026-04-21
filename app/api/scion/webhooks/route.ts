// SCION webhook registry list + create endpoint.
//
// GET  /api/scion/webhooks
//   Returns every `WebhookConfig` row with the `secret` field redacted to
//   `"***" + last4`. Not admin-gated for read parity with the rest of the
//   SCION dashboard — the dashboard itself is admin-scoped.
//
// POST /api/scion/webhooks  — admin-only, audited.
//   Body: { name: string, endpoint: string, secret: string, isActive?: boolean }.
//   Validates:
//     - `endpoint` parses as a URL via `new URL()`
//     - scheme is `https:` (accept `http:` only when hostname === "localhost")
//     - `secret` is a string of length >= 16
//   The audit payload stamps the webhook id, name, endpoint, and secret
//   preview — NEVER the raw secret.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";

export interface WebhookListRow {
  id: string;
  name: string;
  endpoint: string;
  secretPreview: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookListResponse {
  webhooks: WebhookListRow[];
}

export const SECRET_MIN_LENGTH = 16;

export function redactSecret(secret: string): string {
  const tail = secret.length >= 4 ? secret.slice(-4) : secret;
  return `***${tail}`;
}

export function validateEndpoint(endpoint: string):
  | {
      ok: true;
      url: URL;
    }
  | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false, error: "endpoint is not a valid URL" };
  }
  const hostname = url.hostname;
  if (url.protocol === "https:") {
    return { ok: true, url };
  }
  if (url.protocol === "http:" && hostname === "localhost") {
    return { ok: true, url };
  }
  return {
    ok: false,
    error: "endpoint must be https:// (http:// is only accepted for localhost)",
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const rows = await prisma.webhookConfig.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        name: true,
        endpoint: true,
        secret: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const webhooks: WebhookListRow[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      endpoint: r.endpoint,
      secretPreview: redactSecret(r.secret),
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
    const response: WebhookListResponse = { webhooks };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/webhooks GET error:", error);
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
    name?: unknown;
    endpoint?: unknown;
    secret?: unknown;
    isActive?: unknown;
  };
  try {
    body =
      ((await req.json().catch(() => null)) as {
        name?: unknown;
        endpoint?: unknown;
        secret?: unknown;
        isActive?: unknown;
      } | null) ?? {};
  } catch {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const endpoint =
    typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const secret = typeof body.secret === "string" ? body.secret : "";
  const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!endpoint) {
    return NextResponse.json(
      { error: "endpoint is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const urlCheck = validateEndpoint(endpoint);
  if (!urlCheck.ok) {
    return NextResponse.json(
      { error: urlCheck.error },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (typeof secret !== "string" || secret.length < SECRET_MIN_LENGTH) {
    return NextResponse.json(
      { error: `secret must be at least ${SECRET_MIN_LENGTH} characters` },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const created = await prisma.webhookConfig.create({
      data: { name, endpoint, secret, isActive },
      select: {
        id: true,
        name: true,
        endpoint: true,
        secret: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    // Audit payload must never include the raw secret.
    await recordAdminAction(user, "webhook.create", {
      webhookId: created.id,
      name: created.name,
      endpoint: created.endpoint,
      isActive: created.isActive,
      secretPreview: redactSecret(created.secret),
    });
    const webhook: WebhookListRow = {
      id: created.id,
      name: created.name,
      endpoint: created.endpoint,
      secretPreview: redactSecret(created.secret),
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
    return NextResponse.json(
      { ok: true, webhook },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/webhooks POST error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
