"use client";

// Pass 22 — Issue detail side panel for the SCION dashboard.
//
// Fetches /api/scion/issue/[id]?includeMemory=true which returns IssueDetailResponse
// + `recentDecisions` (last `MemoryEpisode kind:"decision"` rows tagged with
// this issueId). Renders:
//   - full instruction + current status + graph status
//   - recent decisions (audit trail + critic verdicts)
//   - Edit form (priority / agentCategory / metadata JSON) hitting PATCH
// Admin-gated at the API level; this component simply calls the API.

import React, { useEffect, useState } from "react";
import useSWR from "swr";
import { X } from "lucide-react";
import type { IssueDetailResponse } from "@/app/api/scion/issue/[id]/route";
import { useGraphTransitionStream } from "@/lib/hooks/useGraphTransitionStream";

const fetcher = async (url: string): Promise<IssueDetailResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as IssueDetailResponse;
};

export interface IssueDetailProps {
  issueId: string;
  onClose?: () => void;
}

const MEMORY_KIND_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "decision", label: "decisions" },
  { key: "all", label: "all kinds" },
  { key: "task_context", label: "task_context" },
  { key: "discovery", label: "discoveries" },
  { key: "observation", label: "observations" },
  { key: "entity", label: "entities" },
  { key: "relation", label: "relations" },
];

const ALL_MEMORY_KINDS =
  "decision,task_context,discovery,observation,entity,relation";

export default function IssueDetail({
  issueId,
  onClose,
}: IssueDetailProps): React.ReactElement {
  const [memoryKind, setMemoryKind] = useState<string>("decision");
  const [historyOffset, setHistoryOffset] = useState<number>(0);
  const [contextOpen, setContextOpen] = useState<boolean>(false);

  const kindQuery = memoryKind === "all" ? ALL_MEMORY_KINDS : memoryKind;
  const key = issueId
    ? `/api/scion/issue/${issueId}?includeMemory=true&memoryKinds=${encodeURIComponent(kindQuery)}&historyOffset=${historyOffset}&historyLimit=25`
    : null;
  const { data, error, isLoading, mutate } = useSWR<IssueDetailResponse>(
    key,
    fetcher,
    { refreshInterval: 15000, revalidateOnFocus: false },
  );
  const {
    transitions,
    latestTransition,
    status: streamStatus,
  } = useGraphTransitionStream(issueId);

  // Revalidate the detail snapshot whenever a fresh transition lands so the
  // decisions / graphState blocks stay in sync with the live node stream.
  useEffect(() => {
    if (!latestTransition) return;
    void mutate();
  }, [latestTransition?.exitedAt, mutate]);

  const [priority, setPriority] = useState<string>("");
  const [agentCategory, setAgentCategory] = useState<string>("");
  const [metadataText, setMetadataText] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  React.useEffect(() => {
    if (data) {
      setPriority(String(data.priority));
      setAgentCategory(data.agentCategory ?? "");
      setMetadataText(
        data.metadata ? JSON.stringify(data.metadata, null, 2) : "{}",
      );
    }
  }, [data]);

  async function handleSave(): Promise<void> {
    if (!data) return;
    setSaving(true);
    setSaveErr(null);
    const patch: Record<string, unknown> = {};
    const parsedPriority = Number.parseInt(priority, 10);
    if (Number.isFinite(parsedPriority) && parsedPriority !== data.priority) {
      patch.priority = parsedPriority;
    }
    const cat = agentCategory.trim();
    const currentCat = data.agentCategory ?? "";
    if (cat !== currentCat) {
      patch.agentCategory = cat === "" ? null : cat;
    }
    try {
      const parsed = JSON.parse(metadataText || "{}");
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        patch.metadata = parsed;
      }
    } catch {
      setSaveErr("metadata is not valid JSON");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(`/api/scion/issue/${issueId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setSaveErr(body.error ?? `Request failed: ${res.status}`);
      } else {
        await mutate();
      }
    } catch (err: unknown) {
      setSaveErr(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!issueId) return <div className="issue-detail issue-detail--empty" />;
  if (isLoading)
    return <div className="issue-detail">Loading issue {issueId}…</div>;
  if (error || !data) {
    return (
      <div className="issue-detail">
        <div className="scion-error-banner">
          Failed to load issue:{" "}
          {String((error as Error | undefined)?.message ?? "unknown")}
        </div>
      </div>
    );
  }

  return (
    <div className="issue-detail">
      <div className="issue-detail__header">
        <h3 className="issue-detail__title">
          {data.title ?? data.instruction.slice(0, 80)}
        </h3>
        {onClose ? (
          <button
            type="button"
            className="issue-detail__close"
            onClick={onClose}
            aria-label="Close detail"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>
      <div className="issue-detail__meta">
        <span className="config-panel__row-meta">id: {data.id}</span>
        <span className="config-panel__row-meta">status: {data.status}</span>
        <span className="config-panel__row-meta">
          priority: {data.priority}
        </span>
        {data.graphState ? (
          <span className="config-panel__row-meta">
            graph: {data.graphState.status} @ {data.graphState.currentNode}
          </span>
        ) : null}
      </div>
      {data.dependencies.length > 0 || data.blockedBy.length > 0 ? (
        <div className="issue-detail__section">
          <div className="issue-detail__section-title">Dependencies</div>
          {data.dependencies.length > 0 ? (
            <div className="issue-detail__chips">
              <span className="config-panel__row-meta">depends on:</span>
              {data.dependencies.map((depId) => (
                <span key={depId} className="issue-detail__chip">
                  {depId.slice(0, 12)}
                </span>
              ))}
            </div>
          ) : null}
          {data.blockedBy.length > 0 ? (
            <div className="issue-detail__chips">
              <span className="config-panel__row-meta">blocked by:</span>
              {data.blockedBy.map((blockId) => (
                <span
                  key={blockId}
                  className="issue-detail__chip issue-detail__chip--blocked"
                >
                  {blockId.slice(0, 12)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="issue-detail__section">
        <div className="issue-detail__section-title">Instruction</div>
        <pre className="issue-detail__pre">{data.instruction}</pre>
      </div>
      <div className="issue-detail__section">
        <div className="issue-detail__section-title">
          Live transitions{" "}
          <span className="config-panel__row-meta">
            {streamStatus === "open"
              ? "· live"
              : streamStatus === "connecting"
                ? "· connecting"
                : streamStatus === "error" || streamStatus === "closed"
                  ? "· reconnecting"
                  : ""}
          </span>
        </div>
        {transitions.length === 0 ? (
          <div className="config-panel__row-meta">Waiting for transitions…</div>
        ) : (
          <ol className="workflow-history">
            {transitions.slice(-10).map((t, i) => (
              <li key={`${t.exitedAt}-${i}`} className="workflow-history__item">
                <span className="workflow-history__node">{t.node}</span>
                <span
                  className={
                    t.outcome === "ok"
                      ? "status-pill status-pill--ok"
                      : t.outcome === "error"
                        ? "status-pill status-pill--err"
                        : "status-pill status-pill--warn"
                  }
                >
                  {t.outcome}
                </span>
                {t.detail ? (
                  <span className="config-panel__row-meta">{t.detail}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="issue-detail__section">
        <div className="issue-detail__section-title">
          Memory episodes{" "}
          <select
            className="issue-detail__input"
            value={memoryKind}
            onChange={(e) => setMemoryKind(e.target.value)}
            style={{ width: "auto", marginLeft: "var(--spacing-2)" }}
          >
            {MEMORY_KIND_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {data.recentDecisions && data.recentDecisions.length > 0 ? (
          <ul className="issue-detail__decisions">
            {data.recentDecisions.map((d) => (
              <li key={d.id} className="issue-detail__decision">
                <div className="config-panel__row-meta">
                  {d.createdAt}
                  {d.kind ? ` · ${d.kind}` : ""}
                </div>
                <div className="issue-detail__decision-summary">
                  {d.summary}
                </div>
                <pre className="issue-detail__pre issue-detail__pre--compact">
                  {JSON.stringify(d.content, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        ) : (
          <div className="config-panel__row-meta">
            No {memoryKind === "all" ? "memory" : memoryKind} episodes.
          </div>
        )}
      </div>
      <div className="issue-detail__section">
        <div className="issue-detail__section-title">
          History ({data.recentHistory.length} of {data.historyTotal})
        </div>
        {data.recentHistory.length === 0 ? (
          <div className="config-panel__row-meta">No recorded history.</div>
        ) : (
          <ol className="workflow-history">
            {data.recentHistory.map((h, i) => (
              <li key={i} className="workflow-history__item">
                <span className="workflow-history__node">{h.node}</span>
                <span
                  className={
                    h.outcome === "ok"
                      ? "status-pill status-pill--ok"
                      : h.outcome === "error"
                        ? "status-pill status-pill--err"
                        : "status-pill status-pill--warn"
                  }
                >
                  {h.outcome}
                </span>
                {h.detail ? (
                  <span className="config-panel__row-meta">{h.detail}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {data.historyTotal > data.recentHistory.length + historyOffset ? (
          <button
            type="button"
            className="issue-detail__save"
            style={{ marginTop: "var(--spacing-2)" }}
            onClick={() => setHistoryOffset((o) => o + 25)}
          >
            Load older
          </button>
        ) : null}
        {historyOffset > 0 ? (
          <button
            type="button"
            className="issue-detail__save"
            style={{
              marginTop: "var(--spacing-2)",
              marginLeft: "var(--spacing-2)",
            }}
            onClick={() => setHistoryOffset(0)}
          >
            Reset
          </button>
        ) : null}
      </div>
      {data.graphState?.context ? (
        <div className="issue-detail__section">
          <div className="issue-detail__section-title">
            Graph context{" "}
            <button
              type="button"
              className="issue-detail__close"
              onClick={() => setContextOpen((o) => !o)}
              aria-label="Toggle context"
            >
              {contextOpen ? "hide" : "show"}
            </button>
          </div>
          {contextOpen ? (
            <pre className="issue-detail__pre">
              {JSON.stringify(data.graphState.context, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
      <div className="issue-detail__section">
        <div className="issue-detail__section-title">Edit</div>
        <label className="issue-detail__field">
          Priority
          <input
            type="number"
            className="issue-detail__input"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
        </label>
        <label className="issue-detail__field">
          Agent category
          <input
            type="text"
            className="issue-detail__input"
            value={agentCategory}
            onChange={(e) => setAgentCategory(e.target.value)}
            placeholder="e.g. 1_qa"
          />
        </label>
        <label className="issue-detail__field">
          Metadata (JSON)
          <textarea
            className="issue-detail__textarea"
            value={metadataText}
            onChange={(e) => setMetadataText(e.target.value)}
            rows={6}
          />
        </label>
        {saveErr ? <div className="scion-error-banner">{saveErr}</div> : null}
        <button
          type="button"
          className="issue-detail__save"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
