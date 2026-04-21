// SCION webhook test-fire endpoint.
//
// POST /api/scion/webhooks/[id]/test  — admin-only, audited.
//   Fires a test HTTP POST against the configured endpoint with:
//     - body: `{"ping":true}` (literal, no whitespace)
//     - `X-HLBW-Signature`: hex HMAC-SHA256(secret, body)
//     - `Content-Type: application/json`
//   Bounded by `AbortSignal.timeout(TEST_TIMEOUT_MS)`. Returns
//   `{ status, durationMs, responseSnippet }`. Response body is capped at
//   2KB. The audit payload never includes the raw secret or response.

import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/orchestration/auth-guard";
import { recordAdminAction } from "@/lib/orchestration/audit";

export interface WebhookTestResponse {
  status: number;
  durationMs: number;
  responseSnippet: string;
  error?: string;
}

export const TEST_TIMEOUT_MS = 5_000;
export const MAX_RESPONSE_BYTES = 2_048;
export const TEST_BODY = '{"ping":true}';
export const SIGNATURE_HEADER = "X-HLBW-Signature";

export function signBody(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

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

function cap(text: string, bytes: number): string {
  // cap by char length — responses are almost always UTF-8 single-byte-ish
  // and we just want a bounded preview for the UI.
  return text.length > bytes ? text.slice(0, bytes) : text;
}

export async function POST(
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

  let row: {
    id: string;
    endpoint: string;
    secret: string;
    isActive: boolean;
  } | null;
  try {
    row = await prisma.webhookConfig.findUnique({
      where: { id },
      select: { id: true, endpoint: true, secret: true, isActive: true },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "db error";
    console.error("/api/scion/webhooks/[id]/test db error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!row) {
    return NextResponse.json(
      { error: "not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const signature = signBody(row.secret, TEST_BODY);
  const startedAt = Date.now();
  let status = 0;
  let responseSnippet = "";
  let errorMessage: string | undefined;

  try {
    const res = await fetch(row.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SIGNATURE_HEADER]: signature,
      },
      body: TEST_BODY,
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
    status = res.status;
    const text = await res.text().catch(() => "");
    responseSnippet = cap(text, MAX_RESPONSE_BYTES);
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      errorMessage = `timeout after ${TEST_TIMEOUT_MS}ms`;
    } else {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  const durationMs = Date.now() - startedAt;
  const response: WebhookTestResponse = {
    status,
    durationMs,
    responseSnippet,
  };
  if (errorMessage) response.error = errorMessage;

  // Audit payload never includes the secret, signature, or response body —
  // just the result summary.
  await recordAdminAction(user, "webhook.test", {
    webhookId: id,
    endpoint: row.endpoint,
    isActive: row.isActive,
    status,
    durationMs,
    error: errorMessage ?? null,
  });

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
