"use client";

import { useState, useEffect, useRef } from "react";
import useSWR, { mutate } from "swr";
import { Database, AlertTriangle, Loader2 } from "lucide-react";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data?.error || "An error occurred while fetching the data.",
    );
  }
  return data;
};

export default function AiClient() {
  const { data: aiSettings, mutate: mutateAiSettings } = useSWR<any[]>(
    "/api/admin/ai-settings",
    fetcher,
    {
      refreshInterval: 10000,
    },
  );

  // Global Gemini Params
  const [maxOutputTokens, setMaxOutputTokens] = useState(8192);
  const [topP, setTopP] = useState(1.0);
  const [topK, setTopK] = useState(40);

  const [isSavingAi, setIsSavingAi] = useState(false);
  const [isSavingConfirmModalOpen, setIsSavingConfirmModalOpen] =
    useState(false);
  const [savingConfirmText, setSavingConfirmText] = useState("");

  const hasLoadedSettings = useRef(false);

  useEffect(() => {
    if (aiSettings && aiSettings.length > 0 && !hasLoadedSettings.current) {
      const activeSetting = aiSettings.find((s) => s.isActive);
      if (activeSetting) {
        setMaxOutputTokens(activeSetting.maxOutputTokens ?? 8192);
        setTopP(activeSetting.topP ?? 1.0);
        setTopK(activeSetting.topK ?? 40);
      }
      hasLoadedSettings.current = true;
    }
  }, [aiSettings]);

  const onSaveFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfirmText("");
    setIsSavingConfirmModalOpen(true);
  };

  const handleSaveAiSetting = async () => {
    setIsSavingAi(true);
    try {
      const res = await fetch("/api/admin/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxOutputTokens,
          topP,
          topK,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Failed to save AI settings");
      }
      mutateAiSettings();
    } catch (error: any) {
      console.error(error);
      alert(`Error saving AI settings: ${error.message}`);
    } finally {
      setIsSavingAi(false);
    }
  };

  return (
    <div className="card mb-8">
      <div
        className="card-header"
        style={{ backgroundColor: "var(--bg-accent-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <h3
            className="flex items-center gap-2 m-0 font-semibold"
            style={{ color: "var(--accent-color)" }}
          >
            <Database size={20} /> AI Agent Configuration
          </h3>
          <div className="badge badge-accent">Gemini Pro API</div>
        </div>
      </div>

      <div className="card-body">
        <form onSubmit={onSaveFormSubmit} className="form-layout">
          {/* Global Parameters */}
          <div className="p-4 border border-border rounded-md bg-secondary">
            <div className="mb-4">
              <strong style={{ fontSize: "1.1rem" }}>
                Gemini Tuning Parameters
              </strong>
            </div>
            <div
              className="grid grid-cols-3 gap-4"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "var(--spacing-4)",
              }}
            >
              <div className="form-group">
                <label className="form-label">Top P ({topP.toFixed(2)})</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  className="form-input"
                  value={topP}
                  onChange={(e) => setTopP(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Top K ({topK})</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  className="form-input"
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Max Tokens</label>
                <input
                  type="number"
                  min="100"
                  max="16384"
                  step="100"
                  className="form-input"
                  value={maxOutputTokens}
                  onChange={(e) => setMaxOutputTokens(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingAi}
              className="btn btn-primary"
              style={{ fontWeight: "bold" }}
            >
              {isSavingAi ? "Saving..." : "Save Configuration"}
            </button>
          </div>
        </form>
      </div>

      {/* SAVE CONFIRM MODAL */}
      {isSavingConfirmModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsSavingConfirmModalOpen(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div
              className="card-header flex items-center gap-2"
              style={{
                color: "var(--warning-color)",
                borderBottom: "1px solid var(--border-color)",
                borderTop: "none",
              }}
            >
              <AlertTriangle size={24} />
              <h2
                style={{ fontSize: "1.25rem", fontWeight: "bold", margin: 0 }}
              >
                Confirm Configuration Change
              </h2>
            </div>
            <div className="card-body">
              <p className="text-secondary mb-4" style={{ lineHeight: "1.5" }}>
                Are you sure you want to save and make this the active AI
                configuration? This will affect all future agent actions.
              </p>
              <form
                id="save-confirm-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (savingConfirmText.toLowerCase() === "confirm") {
                    handleSaveAiSetting();
                    setIsSavingConfirmModalOpen(false);
                  }
                }}
              >
                <label className="form-label mb-2">
                  Type{" "}
                  <span
                    style={{
                      color: "var(--warning-color)",
                      userSelect: "none",
                    }}
                  >
                    confirm
                  </span>{" "}
                  to proceed:
                </label>
                <input
                  type="text"
                  value={savingConfirmText}
                  onChange={(e) => setSavingConfirmText(e.target.value)}
                  className="form-input"
                  placeholder="confirm"
                  required
                  autoFocus
                />
              </form>
            </div>
            <div className="card-footer">
              <button
                type="button"
                onClick={() => setIsSavingConfirmModalOpen(false)}
                className="btn btn-outline"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="save-confirm-form"
                className="btn btn-primary flex items-center gap-2"
                disabled={
                  isSavingAi || savingConfirmText.toLowerCase() !== "confirm"
                }
              >
                {isSavingAi ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  "Make Active"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
