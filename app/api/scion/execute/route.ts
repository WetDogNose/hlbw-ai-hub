// Pass 16 — SCION execute route.
//
// Creates a graph-rooted Issue that the heartbeat dispatcher (pass 6) picks
// up asynchronously. No synchronous worker spawn from this route — the write
// is the trigger. Budget ceiling is enforced via the shared helper in
// `lib/orchestration/budget.ts`.
//
// POST body: {
//   agentName: string,
//   instruction: string,
//   agentCategory?: string,   // "default" | "1_qa" | "2_source_control" | "3_cloud" | "4_db" | "5_bizops"
//   priority?: number,
//   dependencies?: string[],
//   blockedBy?: string[],
//   metadata?: Record<string, unknown>,
// }
// Response: { issueId: string } on success, { error } on budget / validation.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  assertBudgetAvailable,
  BudgetExceededError,
} from "@/lib/orchestration/budget";

interface ExecuteBody {
  agentName?: unknown;
  instruction?: unknown;
  agentCategory?: unknown;
  priority?: unknown;
  dependencies?: unknown;
  blockedBy?: unknown;
  metadata?: unknown;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

export async function POST(req: Request) {
  let body: ExecuteBody;
  try {
    body = (await req.json()) as ExecuteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.agentName !== "string" || body.agentName.length === 0) {
    return NextResponse.json(
      { error: "Agent name is required" },
      { status: 400 },
    );
  }

  if (
    typeof body.instruction !== "string" ||
    body.instruction.trim().length === 0
  ) {
    return NextResponse.json(
      { error: "Instruction is required" },
      { status: 400 },
    );
  }

  // Budget gate — same Paperclip ceiling, now via shared helper.
  try {
    await assertBudgetAvailable();
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const agentName = body.agentName;
  const instruction = body.instruction;
  const agentCategory =
    typeof body.agentCategory === "string" ? body.agentCategory : "default";
  const priority =
    typeof body.priority === "number" && Number.isFinite(body.priority)
      ? Math.floor(body.priority)
      : 5;
  const dependencies = asStringArray(body.dependencies);
  const blockedBy = asStringArray(body.blockedBy);
  const metadata =
    body.metadata &&
    typeof body.metadata === "object" &&
    !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : {};

  try {
    const thread = await prisma.thread.create({
      data: {
        title: `Manual execution: ${agentName}`,
        issues: {
          create: {
            title: `Manual: ${agentName}`,
            instruction,
            status: "pending",
            priority,
            dependencies,
            blockedBy,
            agentCategory,
            metadata: metadata as object,
          },
        },
      },
      include: { issues: true },
    });

    const issue = thread.issues[0];
    if (!issue) {
      return NextResponse.json(
        { error: "Failed to create Issue" },
        { status: 500 },
      );
    }

    return NextResponse.json({ issueId: issue.id, threadId: thread.id });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error("Execution error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
