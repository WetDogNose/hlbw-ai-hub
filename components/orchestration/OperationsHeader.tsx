"use client";

// Pass 22 — Operations tab header bar.
//
// Two buttons: "Heartbeat now" (POST /api/scion/heartbeat-now) and
// "Watchdog now" (POST /api/scion/watchdog-now). Each shows the last fire
// timestamp + short result summary. Refreshes the shared `/api/scion/state`
// SWR cache via the `onAction` callback so TopographyTree/IssueInbox pick
// up the new status instantly.

import React, { useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import type { ScionHeartbeatNowResponse } from "@/app/api/scion/heartbeat-now/route";
import type { ScionWatchdogNowResponse } from "@/app/api/scion/watchdog-now/route";

type HeartbeatStamp = {
  ts: string;
  kind: "heartbeat" | "watchdog";
  summary: string;
};

export interface OperationsHeaderProps {
  onAction?: () => void;
}

export default function OperationsHeader({
  onAction,
}: OperationsHeaderProps): React.ReactElement {
  const [last, setLast] = useState<HeartbeatStamp | null>(null);
  const [busy, setBusy] = useState<"heartbeat" | "watchdog" | null>(null);

  async function fireHeartbeat(): Promise<void> {
    setBusy("heartbeat");
    try {
      const res = await fetch("/api/scion/heartbeat-now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => null)) as
        | ScionHeartbeatNowResponse
        | { error: string }
        | null;
      if (res.ok && body && "dispatched" in body) {
        setLast({
          ts: new Date().toISOString(),
          kind: "heartbeat",
          summary: `reclaimed ${body.staleReclaimed}, dispatched ${body.dispatched.length}`,
        });
      } else {
        setLast({
          ts: new Date().toISOString(),
          kind: "heartbeat",
          summary: `error: ${String(
            body && "error" in body ? body.error : res.status,
          )}`,
        });
      }
      onAction?.();
    } catch (err: unknown) {
      setLast({
        ts: new Date().toISOString(),
        kind: "heartbeat",
        summary: `error: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(null);
    }
  }

  async function fireWatchdog(): Promise<void> {
    setBusy("watchdog");
    try {
      const res = await fetch("/api/scion/watchdog-now", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const body = (await res.json().catch(() => null)) as
        | ScionWatchdogNowResponse
        | { error: string }
        | null;
      if (res.ok && body && "reclaimed" in body) {
        setLast({
          ts: new Date().toISOString(),
          kind: "watchdog",
          summary: `reclaimed ${body.reclaimed} in ${body.elapsedMs}ms`,
        });
      } else {
        setLast({
          ts: new Date().toISOString(),
          kind: "watchdog",
          summary: `error: ${String(
            body && "error" in body ? body.error : res.status,
          )}`,
        });
      }
      onAction?.();
    } catch (err: unknown) {
      setLast({
        ts: new Date().toISOString(),
        kind: "watchdog",
        summary: `error: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ops-header">
      <div className="ops-header__buttons">
        <button
          type="button"
          className="ops-header__button"
          onClick={fireHeartbeat}
          disabled={busy !== null}
        >
          <Activity size={16} />{" "}
          {busy === "heartbeat" ? "Firing…" : "Heartbeat now"}
        </button>
        <button
          type="button"
          className="ops-header__button"
          onClick={fireWatchdog}
          disabled={busy !== null}
        >
          <RefreshCw size={16} />{" "}
          {busy === "watchdog" ? "Running…" : "Watchdog now"}
        </button>
      </div>
      {last ? (
        <div className="ops-header__status">
          Last {last.kind} at {last.ts}: {last.summary}
        </div>
      ) : (
        <div className="ops-header__status ops-header__status--muted">
          No operations fired this session.
        </div>
      )}
    </div>
  );
}
