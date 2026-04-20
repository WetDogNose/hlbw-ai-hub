"use client";

import React from "react";
import useSWR from "swr";
import { Settings, Cpu, Activity, ShieldAlert } from "lucide-react";
import Link from "next/link";

import TopographyTree from "./orchestration/TopographyTree";
import GlobalLedger from "./orchestration/GlobalLedger";
import GoalTracker from "./orchestration/GoalTracker";
import IssueInbox from "./orchestration/IssueInbox";
import ExecuteDialog from "./orchestration/ExecuteDialog";
import type { ScionStateResponse } from "@/app/api/scion/state/route";

const fetcher = async (url: string): Promise<ScionStateResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json() as Promise<ScionStateResponse>;
};

export const SCION_STATE_KEY = "/api/scion/state";

export default function ScionDashboard() {
  const { data, error, isLoading, mutate } = useSWR<ScionStateResponse>(
    SCION_STATE_KEY,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: false },
  );

  const engineOnline = !error;
  const engineLabel = isLoading
    ? "Engine Loading"
    : engineOnline
      ? "Engine Online"
      : "Engine Offline";

  return (
    <div className="scion-container">
      <div className="scion-header">
        <div>
          <h1 className="scion-title">
            <Cpu size={40} className="scion-title-icon" />
            Control Plane
          </h1>
          <p className="scion-subtitle">Autonomous AI Engine command center</p>
        </div>
        <div className="scion-actions">
          <Link
            href="/settings"
            className="scion-status-pill scion-status-pill--settings"
          >
            <Settings size={18} /> Settings
          </Link>
          <div
            className={
              engineOnline
                ? "scion-status-pill scion-status-pill--ok"
                : "scion-status-pill scion-status-pill--warn"
            }
          >
            <Activity size={18} /> {engineLabel}
          </div>
          <div className="scion-status-pill scion-status-pill--warn">
            <ShieldAlert size={18} /> Strict Mode Disabled
          </div>
        </div>
      </div>

      <ExecuteDialog onSubmitted={() => void mutate()} />

      <div className="orchestration-grid">
        <TopographyTree
          issues={data?.issues ?? []}
          workerCounts={data?.workerCounts}
        />
        <GlobalLedger ledgerTotal={data?.ledgerTotal ?? 0} />
        <GoalTracker issues={data?.issues ?? []} />
        <IssueInbox issues={data?.issues ?? []} />
      </div>

      {error ? (
        <div className="scion-error-banner">
          Failed to load SCION state: {String((error as Error).message)}
        </div>
      ) : null}
    </div>
  );
}
