"use client";

// React hook that consumes the /api/orchestrator/stream SSE endpoint.
//
// Contract of the server route ([app/api/orchestrator/stream/route.ts]):
//   - Requires `?issueId=<id>` (plus optional `&since=<isoTs>` cursor)
//   - Emits `event: transition` with JSON data
//     { issueId, node, outcome: "ok" | "error" | "interrupt",
//       enteredAt, exitedAt, detail? }
//   - Closes after 120s; client must reconnect using the last exitedAt as
//     `since` to resume.
//
// The hook handles reconnection automatically: when the EventSource errors or
// the server closes, we wait 1s and reopen, carrying the most recent
// `exitedAt` as `since` so we don't double-deliver events. Consumers get a
// flat, append-only array of transitions plus a connection status flag.

import { useEffect, useRef, useState } from "react";

export type TransitionOutcome = "ok" | "error" | "interrupt";

export interface GraphTransitionEvent {
  issueId: string;
  node: string;
  outcome: TransitionOutcome;
  enteredAt: string;
  exitedAt: string;
  detail?: string;
}

export type StreamConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

export interface UseGraphTransitionStreamResult {
  transitions: GraphTransitionEvent[];
  status: StreamConnectionStatus;
  latestTransition: GraphTransitionEvent | null;
  clear: () => void;
}

/**
 * Subscribe to graph transitions for an Issue via SSE. Pass `null` / undefined
 * to disable the subscription (e.g. when no issue is selected yet).
 */
export function useGraphTransitionStream(
  issueId: string | null | undefined,
): UseGraphTransitionStreamResult {
  const [transitions, setTransitions] = useState<GraphTransitionEvent[]>([]);
  const [status, setStatus] = useState<StreamConnectionStatus>("idle");
  const cursorRef = useRef<string | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!issueId) {
      setStatus("idle");
      return;
    }

    let closedByHook = false;
    let es: EventSource | null = null;

    const open = (): void => {
      const qs = new URLSearchParams({ issueId });
      if (cursorRef.current) qs.set("since", cursorRef.current);
      setStatus("connecting");
      es = new EventSource(`/api/orchestrator/stream?${qs.toString()}`);
      es.addEventListener("open", () => setStatus("open"));
      es.addEventListener("transition", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as GraphTransitionEvent;
          cursorRef.current = data.exitedAt;
          setTransitions((prev) => [...prev, data]);
        } catch {
          // ignore malformed frame
        }
      });
      es.addEventListener("close", () => {
        setStatus("closed");
        if (!closedByHook) scheduleReconnect();
      });
      es.onerror = () => {
        setStatus("error");
        if (!closedByHook) scheduleReconnect();
      };
    };

    const scheduleReconnect = (): void => {
      if (reconnectTimer.current) return;
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        if (es) {
          es.close();
          es = null;
        }
        if (!closedByHook) open();
      }, 1000);
    };

    open();

    return () => {
      closedByHook = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (es) es.close();
      es = null;
    };
  }, [issueId]);

  const latestTransition = transitions.length
    ? transitions[transitions.length - 1]
    : null;

  return {
    transitions,
    status,
    latestTransition,
    clear: () => {
      setTransitions([]);
      cursorRef.current = null;
    },
  };
}
