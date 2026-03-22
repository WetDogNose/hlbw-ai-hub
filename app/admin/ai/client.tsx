"use client";

import { useState, useEffect, useRef } from "react";
import useSWR, { mutate } from "swr";
import { Database, AlertTriangle, Loader2 } from "lucide-react";

const fetcher = async (url: string) => {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data?.error || 'An error occurred while fetching the data.');
    }
    return data;
};

export default function AiClient() {
    const { data: aiSettings, mutate: mutateAiSettings } = useSWR<any[]>('/api/admin/ai-settings', fetcher, {
        refreshInterval: 10000
    });

    // Global Gemini Params
    const [maxOutputTokens, setMaxOutputTokens] = useState(8192);
    const [topP, setTopP] = useState(1.0);
    const [topK, setTopK] = useState(40);

    const [isSavingAi, setIsSavingAi] = useState(false);
    const [isSavingConfirmModalOpen, setIsSavingConfirmModalOpen] = useState(false);
    const [savingConfirmText, setSavingConfirmText] = useState("");

    const hasLoadedSettings = useRef(false);

    useEffect(() => {
        if (aiSettings && aiSettings.length > 0 && !hasLoadedSettings.current) {
            const activeSetting = aiSettings.find(s => s.isActive);
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
            const res = await fetch('/api/admin/ai-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    maxOutputTokens, topP, topK
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
        <div className="card" style={{ overflow: "hidden", marginBottom: "var(--spacing-8)" }}>
            <div className="flex justify-between items-center" style={{ padding: "var(--spacing-6)", borderBottom: "1px solid var(--border-color)", backgroundColor: "var(--accent-bg-subtle)" }}>
                <div className="flex items-center" style={{ gap: "var(--spacing-3)" }}>
                    <h3 className="flex items-center" style={{ margin: 0, gap: "var(--spacing-3)", fontWeight: "600", color: "var(--accent-color)" }}>
                        <Database size={20} /> AI Agent Configuration
                    </h3>
                    <div style={{ backgroundColor: "var(--accent-bg-bold)", color: "var(--accent-color)", fontSize: "0.75rem", fontWeight: "bold", padding: "var(--spacing-1) var(--spacing-3)", borderRadius: "var(--border-radius-lg)" }}>
                        Gemini Pro API
                    </div>
                </div>
            </div>

            <div style={{ padding: "var(--spacing-6)" }}>
                <form onSubmit={onSaveFormSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-6)", marginBottom: "var(--spacing-8)" }}>
                    {/* Global Parameters */}
                    <div style={{ padding: "var(--spacing-4)", border: "1px solid var(--border-color)", borderRadius: "var(--border-radius-md)", backgroundColor: "var(--bg-secondary)" }}>
                        <div style={{ marginBottom: "var(--spacing-4)" }}><strong style={{ fontSize: "1.1rem" }}>Gemini Tuning Parameters</strong></div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--spacing-4)" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-2)" }}>
                                <label className="form-label">Top P ({topP.toFixed(2)})</label>
                                <input type="number" min="0" max="1" step="0.05" className="form-input" value={topP} onChange={(e) => setTopP(Number(e.target.value))} />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-2)" }}>
                                <label className="form-label">Top K ({topK})</label>
                                <input type="number" min="1" max="100" step="1" className="form-input" value={topK} onChange={(e) => setTopK(Number(e.target.value))} />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-2)" }}>
                                <label className="form-label">Max Tokens</label>
                                <input type="number" min="100" max="16384" step="100" className="form-input" value={maxOutputTokens} onChange={(e) => setMaxOutputTokens(Number(e.target.value))} />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button type="submit" disabled={isSavingAi} className="btn btn-primary" style={{ padding: "var(--spacing-3) var(--spacing-6)", borderRadius: "var(--border-radius-md)", fontWeight: "bold" }}>
                            {isSavingAi ? "Saving..." : "Save Configuration"}
                        </button>
                    </div>
                </form>
            </div>

            {/* SAVE CONFIRM MODAL */}
            {isSavingConfirmModalOpen && (
                <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--spacing-4)", backgroundColor: "var(--overlay-bg)", backdropFilter: "blur(4px)" }} onClick={() => setIsSavingConfirmModalOpen(false)}>
                    <div className="card" style={{ width: "100%", maxWidth: "450px", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center" style={{ padding: "var(--spacing-6)", borderBottom: "1px solid var(--border-color)", gap: "var(--spacing-3)", color: "var(--warning-color)" }}>
                            <AlertTriangle size={24} />
                            <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", margin: 0 }}>Confirm Configuration Change</h2>
                        </div>
                        <div style={{ padding: "var(--spacing-6)" }}>
                            <p style={{ margin: "0 0 var(--spacing-4) 0", lineHeight: "1.5" }}>
                                Are you sure you want to save and make this the active AI configuration? This will affect all future agent actions.
                            </p>
                            <form id="save-confirm-form" onSubmit={(e) => {
                                e.preventDefault();
                                if (savingConfirmText.toLowerCase() === 'confirm') {
                                    handleSaveAiSetting();
                                    setIsSavingConfirmModalOpen(false);
                                }
                            }}>
                                <label className="form-label" style={{ fontWeight: 600, display: "block", marginBottom: "var(--spacing-2)" }}>
                                    Type <span style={{ color: "var(--warning-color)", userSelect: "none" }}>confirm</span> to proceed:
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
                        <div className="flex justify-end" style={{ borderTop: "1px solid var(--border-color)", padding: "var(--spacing-6)", gap: "var(--spacing-3)", backgroundColor: "var(--bg-tertiary)" }}>
                            <button type="button" onClick={() => setIsSavingConfirmModalOpen(false)} className="btn btn-outline" style={{ backgroundColor: "var(--bg-secondary)" }}>Cancel</button>
                            <button
                                type="submit"
                                form="save-confirm-form"
                                className="btn btn-primary"
                                disabled={isSavingAi || savingConfirmText.toLowerCase() !== 'confirm'}
                            >
                                {isSavingAi ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : "Make Active"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}