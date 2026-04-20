// Pass 21 — SCION workflow snapshot endpoint.
//
// GET /api/scion/workflow/[id]
// Returns WorkflowSnapshot for a single Issue (graph topology + history +
// cycle counts + last critic verdict if persisted). 404 when no
// TaskGraphState row exists for the Issue.

import { NextResponse } from "next/server";
import {
  getWorkflow,
  type WorkflowSnapshot,
} from "@/lib/orchestration/introspection";

export type ScionWorkflowResponse = WorkflowSnapshot;

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } },
): Promise<NextResponse> {
  const paramsMaybePromise = (context as { params: unknown }).params;
  const params =
    paramsMaybePromise instanceof Promise
      ? await paramsMaybePromise
      : (paramsMaybePromise as { id: string });
  const id = params.id;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { error: "issue id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const snapshot = await getWorkflow(id);
    if (!snapshot) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("/api/scion/workflow/[id] error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
