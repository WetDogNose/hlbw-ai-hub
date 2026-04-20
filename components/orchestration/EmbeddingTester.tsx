"use client";

// Pass 24 — SCION embedding tester.
//
// Admin-only (route enforces). Textarea (≤2000 chars) → POST
// /api/scion/embeddings/test → displays provider name, dim, and the first 12
// elements of the vector in a styled grid.

import React, { useState } from "react";
import type { EmbeddingTestResponse } from "@/app/api/scion/embeddings/test/route";

const MAX_TEXT_CHARS = 2_000;

export default function EmbeddingTester(): React.ReactElement {
  const [text, setText] = useState<string>("");
  const [result, setResult] = useState<EmbeddingTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const overLimit = text.length > MAX_TEXT_CHARS;

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    if (overLimit || text.trim().length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scion/embeddings/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? `HTTP ${res.status}`);
        setResult(null);
        return;
      }
      const data = (await res.json()) as EmbeddingTestResponse;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "embed failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="embedding-tester">
      <h3 className="ops-section-title">Embedding tester</h3>
      <form className="embedding-tester__form" onSubmit={handleSubmit}>
        <textarea
          className="embedding-tester__textarea"
          rows={4}
          placeholder="Text to embed (max 2000 chars)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="embedding-tester__footer">
          <span
            className={
              overLimit
                ? "embedding-tester__count embedding-tester__count--warn"
                : "embedding-tester__count"
            }
          >
            {text.length} / {MAX_TEXT_CHARS}
          </span>
          <button
            type="submit"
            className="embedding-tester__button"
            disabled={loading || overLimit || text.trim().length === 0}
          >
            {loading ? "Embedding…" : "Embed"}
          </button>
        </div>
      </form>
      {error ? <div className="scion-error-banner">{error}</div> : null}
      {result ? (
        <div className="embedding-tester__result">
          <div className="embedding-tester__meta">
            <span>
              provider: <strong>{result.provider}</strong>
            </span>
            <span>
              dim: <strong>{result.dim}</strong>
            </span>
            <span>showing first {result.vector.length} elements</span>
          </div>
          <div className="embedding-tester__grid">
            {result.vector.map((n, i) => (
              <div key={i} className="embedding-tester__cell">
                <span className="embedding-tester__cell-idx">{i}</span>
                <span className="embedding-tester__cell-val">
                  {n.toFixed(6)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
