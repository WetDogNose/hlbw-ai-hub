// SCION webhook detail endpoint.
//
// GET    /api/scion/webhooks/[id]
//   Returns the webhook row with `secret` redacted to `"***" + last4`.
//
// PATCH  /api/scion/webhooks/[id]   — admin-only, audited.
//   Body accepts any subset of { name, endpoint, secret, isActive }.
//   Re-validates endpoint URL and secret length when those fields are
//   supplied. The audit payload excludes the raw secret — when a rotation
//   happens we log `secretRotated: true` + the new secret's preview.
//
// DELETE /api/scion/webhooks/[id]   — admin-only, audited.

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";
import {
  redactSecret,
  validateEndpoint,
  SECRET_MIN_LENGTH,
  type WebhookListRow,
} from "../route";

async function resolveParamId(
  context: { params: Promise<{ id: string }> } | { params: { id: string } },
): Promise<string | null> {
  const paramsMaybePromise = (context as { params: unknown }).params;
  const params =
    paramsMaybePromise instanceof Promise
      ? await paramsMaybePromise
      : (paramsMaybePromise as { id: string });
  const id = params.id;
  if (!id || typeof id !== "string") return null;
  return id;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } },
): Promise<NextResponse> {
  const id = await resolveParamId(context);
  if (!id) {
    return NextResponse.json(
      { error: "webhook id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const row = await prisma.webhookConfig.findUnique({
      where: { id },
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
    if (!row) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const body: WebhookListRow = {
      id: row.id,
      name: row.name,
      endpoint: row.endpoint,
      secretPreview: redactSecret(row.secret),
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/webhooks/[id] GET error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } },
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  const id = await resolveParamId(context);
  if (!id) {
    return NextResponse.json(
      { error: "webhook id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: Record<string, unknown> | null;
  try {
    body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
  } catch {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "invalid body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const patch: {
    name?: string;
    endpoint?: string;
    secret?: string;
    isActive?: boolean;
  } = {};

  if ("name" in body) {
    const v = body.name;
    if (typeof v !== "string" || v.trim().length === 0) {
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    patch.name = v.trim();
  }
  if ("endpoint" in body) {
    const v = body.endpoint;
    if (typeof v !== "string" || v.trim().length === 0) {
      return NextResponse.json(
        { error: "endpoint must be a non-empty string" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const check = validateEndpoint(v.trim());
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    patch.endpoint = v.trim();
  }
  if ("secret" in body) {
    const v = body.secret;
    if (typeof v !== "string" || v.length < SECRET_MIN_LENGTH) {
      return NextResponse.json(
        {
          error: `secret must be at least ${SECRET_MIN_LENGTH} characters`,
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    patch.secret = v;
  }
  if ("isActive" in body) {
    const v = body.isActive;
    if (typeof v !== "boolean") {
      return NextResponse.json(
        { error: "isActive must be a boolean" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    patch.isActive = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "no editable fields supplied" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const existing = await prisma.webhookConfig.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const data: Prisma.WebhookConfigUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.endpoint !== undefined) data.endpoint = patch.endpoint;
    if (patch.secret !== undefined) data.secret = patch.secret;
    if (patch.isActive !== undefined) data.isActive = patch.isActive;

    const updated = await prisma.webhookConfig.update({
      where: { id },
      data,
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

    // Audit payload: never include the raw secret, only the preview + a
    // boolean flag so operators can see a rotation happened.
    const auditPayload: Record<string, unknown> = {
      webhookId: id,
    };
    if (patch.name !== undefined) auditPayload.name = patch.name;
    if (patch.endpoint !== undefined) auditPayload.endpoint = patch.endpoint;
    if (patch.isActive !== undefined) auditPayload.isActive = patch.isActive;
    if (patch.secret !== undefined) {
      auditPayload.secretRotated = true;
      auditPayload.secretPreview = redactSecret(updated.secret);
    }
    await recordAdminAction(user, "webhook.patch", auditPayload);

    const webhook: WebhookListRow = {
      id: updated.id,
      name: updated.name,
      endpoint: updated.endpoint,
      secretPreview: redactSecret(updated.secret),
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
    return NextResponse.json(
      { ok: true, webhook },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "patch failed";
    console.error("/api/scion/webhooks/[id] PATCH error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } },
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  const id = await resolveParamId(context);
  if (!id) {
    return NextResponse.json(
      { error: "webhook id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const existing = await prisma.webhookConfig.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    await prisma.webhookConfig.delete({ where: { id } });
    await recordAdminAction(user, "webhook.delete", {
      webhookId: id,
      name: existing.name,
    });
    return NextResponse.json(
      { ok: true, id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "delete failed";
    console.error("/api/scion/webhooks/[id] DELETE error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
