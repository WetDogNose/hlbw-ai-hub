"use client";

// Pass 24 — SCION provider tester.
//
// Admin-only (route enforces). Pick a provider + prompt; a confirmation
// prompt warns about the token cost before the POST. Displays response,
// token usage, and duration.

import React, { useState } from "react";
import type { ProviderTestResponse } from "@/app/api/scion/providers/test/route";

const PROVIDERS = ["gemini", "paperclip"] as const;
type ProviderName = (typeof PROVIDERS)[number];

const MAX_PROMPT_CHARS = 4_000;

export default function ProviderTester(): React.ReactElement {
  const [provider, setProvider] = useState<ProviderName>("gemini");
  const [prompt, setPrompt] = useState<string>("");
  const [result, setResult] = useState<ProviderTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const overLimit = prompt.length > MAX_PROMPT_CHARS;

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    if (overLimit || prompt.trim().length === 0) return;
    if (
      !window.confirm(
        `Run a test generation against provider=${provider}? This consumes tokens. Output is capped at 200 tokens.`,
      )
    )
      return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scion/providers/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, prompt }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? `HTTP ${res.status}`);
        setResult(null);
        return;
      }
      const data = (await res.json()) as ProviderTestResponse;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "generate failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="provider-tester">
      <h3 className="ops-section-title">Provider tester</h3>
      <div className="provider-tester__warning">
        Warning: live test; output capped at 200 tokens.
      </div>
      <form className="provider-tester__form" onSubmit={handleSubmit}>
        <label className="provider-tester__label">
          Provider:{" "}
          <select
            className="provider-tester__select"
            value={provider}
            onChange={(e) => setProvider(e.target.value as ProviderName)}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <textarea
          className="provider-tester__textarea"
          rows={4}
          placeholder="Prompt (max 4000 chars)…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="provider-tester__footer">
          <span
            className={
              overLimit
                ? "provider-tester__count provider-tester__count--warn"
                : "provider-tester__count"
            }
          >
            {prompt.length} / {MAX_PROMPT_CHARS}
          </span>
          <button
            type="submit"
            className="provider-tester__button"
            disabled={loading || overLimit || prompt.trim().length === 0}
          >
            {loading ? "Running…" : "Run"}
          </button>
        </div>
      </form>
      {error ? <div className="scion-error-banner">{error}</div> : null}
      {result ? (
        <div className="provider-tester__result">
          <div className="provider-tester__meta">
            <span>
              provider: <strong>{result.provider}</strong>
            </span>
            <span>model: {result.modelId}</span>
            <span>duration: {result.durationMs} ms</span>
            <span>
              tokens: in={result.usage.input_tokens} / out=
              {result.usage.output_tokens}
            </span>
          </div>
          <pre className="provider-tester__response">{result.response}</pre>
        </div>
      ) : null}
    </div>
  );
}
