// Pass 16 — Real SSE over TaskGraphState.history.
//
// GET /api/orchestrator/stream?issueId=<id>[&since=<isoTs>]
//
// Opens a `text/event-stream` response. Every 1000ms the handler polls the
// `TaskGraphState.history` JSON column for the given issue and emits any
// HistoryEntry records whose `exitedAt` is newer than the client's cursor.
// Each entry is serialised as one SSE `event: transition` message plus the
// JSON payload on the `data:` line.
//
// Keep-alive: the handler writes the SSE comment `":keep-alive\n\n"` every
// 15 seconds so intermediate proxies don't close the socket.
//
// Connection cap: Cloud Run cannot hold a connection indefinitely. The
// stream closes after 120 seconds; the browser client should reconnect and
// supply `?since=` to resume at the last seen `exitedAt`.
//
// Why database-as-bus: the swarm spawns workers as detached subprocesses
// (see `lib/orchestration/dispatcher.ts::spawnWorkerSubprocess`). An
// in-process pub/sub cannot reach those workers. `TaskGraphState.history`
// is already the authoritative append-only log; we simply poll it.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { HistoryEntry } from "@/lib/orchestration/graph/types";

export const MAX_CONNECTION_MS = 120_000;
export const POLL_INTERVAL_MS = 1_000;
export const KEEPALIVE_INTERVAL_MS = 15_000;
export const KEEPALIVE_COMMENT = ":keep-alive\n\n";

interface TransitionPayload {
  issueId: string;
  node: string;
  outcome: HistoryEntry["outcome"];
  enteredAt: string;
  exitedAt: string;
  detail?: string;
}

/**
 * Read the TaskGraphState.history column and return entries newer than
 * `sinceIso`. Exported for unit testing.
 */
export async function fetchNewHistory(
  issueId: string,
  sinceIso: string | null,
): Promise<HistoryEntry[]> {
  const row = await prisma.taskGraphState.findUnique({
    where: { issueId },
    select: { history: true, status: true },
  });
  if (!row || !Array.isArray(row.history)) return [];
  const all = row.history as unknown as HistoryEntry[];
  if (!sinceIso) return all;
  return all.filter((h) => h.exitedAt > sinceIso);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const issueId = url.searchParams.get("issueId");
  const sinceInitial = url.searchParams.get("since");

  if (!issueId) {
    return NextResponse.json(
      { error: "issueId query parameter is required" },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  let since: string | null = sinceInitial;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (pollTimer !== null) clearInterval(pollTimer);
        if (keepAliveTimer !== null) clearInterval(keepAliveTimer);
        if (closeTimer !== null) clearTimeout(closeTimer);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      // Open marker so the browser's `EventSource.onopen` fires promptly.
      send(`event: open\ndata: ${JSON.stringify({ issueId })}\n\n`);

      const poll = async () => {
        try {
          const entries = await fetchNewHistory(issueId, since);
          for (const entry of entries) {
            const payload: TransitionPayload = {
              issueId,
              node: entry.node,
              outcome: entry.outcome,
              enteredAt: entry.enteredAt,
              exitedAt: entry.exitedAt,
              detail: entry.detail,
            };
            send(`event: transition\ndata: ${JSON.stringify(payload)}\n\n`);
            since = entry.exitedAt;
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "poll failed";
          send(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
        }
      };

      // Kick first poll immediately so tests and UIs see the first
      // transition inside ~1s of opening.
      void poll();
      pollTimer = setInterval(poll, POLL_INTERVAL_MS);
      keepAliveTimer = setInterval(
        () => send(KEEPALIVE_COMMENT),
        KEEPALIVE_INTERVAL_MS,
      );
      closeTimer = setTimeout(() => {
        send(
          `event: close\ndata: ${JSON.stringify({
            reason: "max-connection-ms",
            since,
          })}\n\n`,
        );
        cleanup();
      }, MAX_CONNECTION_MS);

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      closed = true;
      if (pollTimer !== null) clearInterval(pollTimer);
      if (keepAliveTimer !== null) clearInterval(keepAliveTimer);
      if (closeTimer !== null) clearTimeout(closeTimer);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
