"use client";

// Live transition stream for a specific Issue. The backend SSE endpoint
// (`/api/orchestrator/stream`) requires an `issueId` query param and emits
// `event: transition` records off TaskGraphState.history — NOT arbitrary log
// lines. When no issueId is provided (e.g. the current thread placeholder
// page has no real data) we render a static placeholder instead of opening
// a broken connection.

import React, { useEffect, useState } from "react";
import { Terminal } from "lucide-react";

interface TransitionEvent {
  issueId: string;
  node: string;
  outcome: "ok" | "error" | "interrupt";
  enteredAt: string;
  exitedAt: string;
  detail?: string;
}

export interface LiveExecutionBlockProps {
  issueId?: string | null;
}

export default function LiveExecutionBlock({
  issueId,
}: LiveExecutionBlockProps = {}) {
  const [transitions, setTransitions] = useState<TransitionEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!issueId) return;
    const sse = new EventSource(
      `/api/orchestrator/stream?issueId=${encodeURIComponent(issueId)}`,
    );
    sse.addEventListener("open", () => setConnected(true));
    sse.addEventListener("transition", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as TransitionEvent;
        setTransitions((prev) => [...prev, data]);
      } catch {
        // ignore malformed
      }
    });
    sse.addEventListener("close", () => setConnected(false));
    sse.onerror = () => setConnected(false);
    return () => sse.close();
  }, [issueId]);

  return (
    <div className="live-execution">
      <div className="live-execution__header">
        <Terminal size={16} /> Live Execution
        {issueId ? (
          <span className="live-execution__status">
            {connected ? "· connected" : "· reconnecting"}
          </span>
        ) : null}
      </div>
      <div className="live-execution__body">
        {!issueId ? (
          <div className="live-execution__empty">
            No issue bound to this stream.
          </div>
        ) : transitions.length === 0 ? (
          <div className="live-execution__empty">Waiting for transitions…</div>
        ) : (
          transitions.map((t, i) => (
            <div key={i} className="live-execution__line">
              <span className="live-execution__node">{t.node}</span>
              <span
                className={
                  t.outcome === "ok"
                    ? "live-execution__outcome--ok"
                    : t.outcome === "error"
                      ? "live-execution__outcome--error"
                      : "live-execution__outcome--warn"
                }
              >
                {t.outcome}
              </span>
              {t.detail ? (
                <span className="live-execution__detail">{t.detail}</span>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
