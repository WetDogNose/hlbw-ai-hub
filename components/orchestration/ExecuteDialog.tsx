"use client";

import React, { useEffect, useState } from "react";
import { Rocket } from "lucide-react";

const AGENT_CATEGORIES = [
  "default",
  "1_qa",
  "2_source_control",
  "3_cloud",
  "4_db",
  "5_bizops",
] as const;

type AgentCategory = (typeof AGENT_CATEGORIES)[number];

export interface ExecuteDialogPrefill {
  // Pass 24 — TemplateBrowser raises a selected template into the dashboard;
  // the dashboard hands a prefill object down so the Execute form shows the
  // template content without breaking the controlled-input model.
  instruction?: string;
  agentName?: string;
  agentCategory?: AgentCategory;
  // Monotonically-increasing key so two clicks on the same template retrigger
  // the useEffect below.
  nonce?: number;
}

export interface ExecuteDialogProps {
  onSubmitted?: () => void;
  prefill?: ExecuteDialogPrefill;
}

export default function ExecuteDialog({
  onSubmitted,
  prefill,
}: ExecuteDialogProps) {
  const [agentName, setAgentName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [agentCategory, setAgentCategory] = useState<AgentCategory>("default");

  useEffect(() => {
    if (!prefill) return;
    if (typeof prefill.instruction === "string") {
      setInstruction(prefill.instruction);
    }
    if (typeof prefill.agentName === "string") {
      setAgentName(prefill.agentName);
    }
    if (prefill.agentCategory) {
      setAgentCategory(prefill.agentCategory);
    }
  }, [prefill?.nonce, prefill]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setToast(null);
    setIsError(false);
    try {
      const res = await fetch("/api/scion/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentName, instruction, agentCategory }),
      });
      const body = (await res.json()) as
        | { issueId: string }
        | { error: string };
      if (!res.ok) {
        const errBody = body as { error?: string };
        setIsError(true);
        setToast(errBody.error ?? `Request failed: ${res.status}`);
        return;
      }
      const okBody = body as { issueId: string };
      setToast(`Queued issue ${okBody.issueId}`);
      setAgentName("");
      setInstruction("");
      setAgentCategory("default");
      onSubmitted?.();
    } catch (err: unknown) {
      setIsError(true);
      const message = err instanceof Error ? err.message : "Execute failed";
      setToast(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="execute-dialog" onSubmit={submit}>
      <h2 className="execute-dialog__title">
        <Rocket size={20} /> Execute Agent
      </h2>
      <div className="execute-dialog__row">
        <label className="execute-dialog__label" htmlFor="execute-agent-name">
          Agent Name
          <input
            id="execute-agent-name"
            className="execute-dialog__input"
            type="text"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="e.g. qa-sentry"
            required
          />
        </label>
        <label
          className="execute-dialog__label"
          htmlFor="execute-agent-category"
        >
          Category
          <select
            id="execute-agent-category"
            className="execute-dialog__input"
            value={agentCategory}
            onChange={(e) => setAgentCategory(e.target.value as AgentCategory)}
          >
            {AGENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="execute-dialog__label" htmlFor="execute-instruction">
        Instruction
        <textarea
          id="execute-instruction"
          className="execute-dialog__textarea"
          rows={4}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Describe the task..."
          required
        />
      </label>
      <div className="execute-dialog__footer">
        <button
          type="submit"
          className="execute-dialog__submit"
          disabled={submitting}
        >
          {submitting ? "Queuing..." : "Execute"}
        </button>
        {toast ? (
          <span
            className={
              isError
                ? "execute-dialog__toast execute-dialog__toast--error"
                : "execute-dialog__toast execute-dialog__toast--ok"
            }
          >
            {toast}
          </span>
        ) : null}
      </div>
    </form>
  );
}
