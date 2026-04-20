"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { Settings, Cpu, Activity, ShieldAlert } from "lucide-react";
import Link from "next/link";

import TopographyTree from "./orchestration/TopographyTree";
import GlobalLedger from "./orchestration/GlobalLedger";
import GoalTracker from "./orchestration/GoalTracker";
import IssueInbox from "./orchestration/IssueInbox";
import ExecuteDialog from "./orchestration/ExecuteDialog";
import LiveWorkers from "./orchestration/LiveWorkers";
import WorkflowGraph from "./orchestration/WorkflowGraph";
import TraceSidebar from "./orchestration/TraceSidebar";
import AbilityMatrix from "./orchestration/AbilityMatrix";
import ConfigPanel from "./orchestration/ConfigPanel";
import MemoryBrowser from "./orchestration/MemoryBrowser";
// Pass 22 — new ops-console components.
import UserChip from "./orchestration/UserChip";
import OperationsHeader from "./orchestration/OperationsHeader";
import IssueDetail from "./orchestration/IssueDetail";
// Pass 23 — config + analytics components.
import BudgetBreakdown from "./orchestration/BudgetBreakdown";
import RuntimeConfigPanel from "./orchestration/RuntimeConfigPanel";
import MCPToolBrowser from "./orchestration/MCPToolBrowser";
import MemorySearch from "./orchestration/MemorySearch";
import TraceFilters, {
  type TraceFilterValues,
} from "./orchestration/TraceFilters";
// Pass 24 — seeder + niche operator tools.
import CodeIndexPanel from "./orchestration/CodeIndexPanel";
import EmbeddingTester from "./orchestration/EmbeddingTester";
import ProviderTester from "./orchestration/ProviderTester";
import TemplateBrowser, {
  type TemplateBrowserTemplate,
} from "./orchestration/TemplateBrowser";
import type { ScionStateResponse } from "@/app/api/scion/state/route";

const fetcher = async (url: string): Promise<ScionStateResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json() as Promise<ScionStateResponse>;
};

export const SCION_STATE_KEY = "/api/scion/state";

type TabKey = "operations" | "workflow" | "abilities" | "memory";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "operations", label: "Operations" },
  { key: "workflow", label: "Workflow" },
  { key: "abilities", label: "Abilities" },
  { key: "memory", label: "Memory" },
];

export default function ScionDashboard() {
  const { data, error, isLoading, mutate } = useSWR<ScionStateResponse>(
    SCION_STATE_KEY,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: false },
  );
  const [tab, setTab] = useState<TabKey>("operations");
  const [selectedIssueId, setSelectedIssueId] = useState<string>("");
  const [detailIssueId, setDetailIssueId] = useState<string | null>(null);
  // Pass 23 — trace filter state (lifted so TraceSidebar receives it below).
  const [traceFilters, setTraceFilters] = useState<TraceFilterValues>({
    status: "",
    category: "",
    from: "",
    to: "",
  });
  // Pass 24 — template browser pre-fills ExecuteDialog via a shared state.
  const [executePrefill, setExecutePrefill] = useState<{
    instruction: string;
    agentName: string;
    nonce: number;
  } | null>(null);
  const handleTemplateSelect = (template: TemplateBrowserTemplate): void => {
    setExecutePrefill({
      instruction: template.content,
      agentName: template.name.replace(/\.(ya?ml)$/i, ""),
      nonce: Date.now(),
    });
  };
  const categories = Array.from(
    new Set(
      (data?.issues ?? [])
        .map((i) => i.agentCategory)
        .filter((c): c is string => typeof c === "string" && c.length > 0),
    ),
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
          <UserChip />
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

      <TemplateBrowser onSelect={handleTemplateSelect} />

      <ExecuteDialog
        onSubmitted={() => void mutate()}
        prefill={executePrefill ?? undefined}
      />

      <div className="scion-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={
              tab === t.key ? "scion-tab scion-tab--active" : "scion-tab"
            }
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "operations" ? (
        <div className="scion-tab-panel">
          <OperationsHeader onAction={() => void mutate()} />
          <div className="scion-ops-columns">
            <div className="scion-ops-main">
              <div className="orchestration-grid">
                <TopographyTree
                  issues={data?.issues ?? []}
                  workerCounts={data?.workerCounts}
                />
                <GlobalLedger ledgerTotal={data?.ledgerTotal ?? 0} />
                <GoalTracker issues={data?.issues ?? []} />
                <IssueInbox
                  issues={data?.issues ?? []}
                  onOpenDetail={(id) => setDetailIssueId(id)}
                />
              </div>
              <LiveWorkers />
              <BudgetBreakdown />
            </div>
            {detailIssueId ? (
              <div className="scion-ops-sidepanel">
                <IssueDetail
                  issueId={detailIssueId}
                  onClose={() => setDetailIssueId(null)}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "workflow" ? (
        <div className="scion-tab-panel">
          <div className="ops-issue-selector">
            <label>
              Issue:{" "}
              <select
                className="ops-issue-selector__select"
                value={selectedIssueId}
                onChange={(e) => setSelectedIssueId(e.target.value)}
              >
                <option value="">(select an issue)</option>
                {(data?.issues ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.id} — {i.title ?? i.instruction.slice(0, 60)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selectedIssueId ? (
            <WorkflowGraph issueId={selectedIssueId} />
          ) : (
            <div className="workflow-graph">Select an issue to inspect.</div>
          )}
          <TraceFilters
            value={traceFilters}
            onChange={setTraceFilters}
            categories={categories}
          />
          <TraceSidebar
            issueId={selectedIssueId || undefined}
            onSelect={(id) => setSelectedIssueId(id)}
            status={traceFilters.status}
            category={traceFilters.category}
            from={traceFilters.from}
            to={traceFilters.to}
          />
        </div>
      ) : null}

      {tab === "abilities" ? (
        <div className="scion-tab-panel">
          <AbilityMatrix />
          <ConfigPanel />
          <RuntimeConfigPanel />
          <MCPToolBrowser />
          <div className="scion-tools-section">
            <h2 className="scion-tools-section__title">Tools</h2>
            <CodeIndexPanel />
            <EmbeddingTester />
            <ProviderTester />
            <TemplateBrowser onSelect={handleTemplateSelect} />
          </div>
        </div>
      ) : null}

      {tab === "memory" ? (
        <div className="scion-tab-panel">
          <MemorySearch />
          <MemoryBrowser />
        </div>
      ) : null}

      {error ? (
        <div className="scion-error-banner">
          Failed to load SCION state: {String((error as Error).message)}
        </div>
      ) : null}
    </div>
  );
}
