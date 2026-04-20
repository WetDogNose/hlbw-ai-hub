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

import React, { useState } from "react";
import useSWR from "swr";
import { X } from "lucide-react";
import type { IssueDetailResponse } from "@/app/api/scion/issue/[id]/route";

const fetcher = async (url: string): Promise<IssueDetailResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as IssueDetailResponse;
};

export interface IssueDetailProps {
  issueId: string;
  onClose?: () => void;
}

export default function IssueDetail({
  issueId,
  onClose,
}: IssueDetailProps): React.ReactElement {
  const key = issueId ? `/api/scion/issue/${issueId}?includeMemory=true` : null;
  const { data, error, isLoading, mutate } = useSWR<IssueDetailResponse>(
    key,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: false },
  );

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
        {data.graphState ? (
          <span className="config-panel__row-meta">
            graph: {data.graphState.status} @ {data.graphState.currentNode}
          </span>
        ) : null}
      </div>
      <div className="issue-detail__section">
        <div className="issue-detail__section-title">Instruction</div>
        <pre className="issue-detail__pre">{data.instruction}</pre>
      </div>
      <div className="issue-detail__section">
        <div className="issue-detail__section-title">
          Recent decisions (audit + critic)
        </div>
        {data.recentDecisions && data.recentDecisions.length > 0 ? (
          <ul className="issue-detail__decisions">
            {data.recentDecisions.map((d) => (
              <li key={d.id} className="issue-detail__decision">
                <div className="config-panel__row-meta">{d.createdAt}</div>
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
          <div className="config-panel__row-meta">No recorded decisions.</div>
        )}
      </div>
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
