"use client";

// Pass 23 — SCION runtime-config editor.
//
// Admin-only view, but this component does not enforce — the route does
// (GET /api/scion/runtime-config returns 403 for non-admins and the SWR
// layer surfaces the error). Each of the 5 known keys gets a typed editor:
//   - category_provider_overrides: JSON textarea (object key->provider)
//   - cycle_cap / exploration_budget / watchdog_timeout_minutes: number input
//   - confidence_threshold: number input (0..1)

import React, { useState } from "react";
import useSWR, { mutate } from "swr";
import type { ScionRuntimeConfigResponse } from "@/app/api/scion/runtime-config/route";
import type {
  RuntimeConfigEffective,
  RuntimeConfigKey,
} from "@/lib/orchestration/runtime-config";

const fetcher = async (url: string): Promise<ScionRuntimeConfigResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as ScionRuntimeConfigResponse;
};

const RUNTIME_CONFIG_KEY = "/api/scion/runtime-config";

type EditorState = {
  raw: string;
  error: string | null;
  saving: boolean;
};

function parseForKey(
  key: RuntimeConfigKey,
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (key === "category_provider_overrides") {
    try {
      const parsed = JSON.parse(raw);
      return { ok: true, value: parsed };
    } catch (err) {
      return {
        ok: false,
        error: `invalid JSON: ${err instanceof Error ? err.message : "parse failed"}`,
      };
    }
  }
  const num =
    key === "confidence_threshold"
      ? Number.parseFloat(raw)
      : Number.parseInt(raw, 10);
  if (!Number.isFinite(num)) {
    return { ok: false, error: "not a number" };
  }
  return { ok: true, value: num };
}

function encodeValue(value: unknown): string {
  if (typeof value === "number") return String(value);
  return JSON.stringify(value, null, 2);
}

function KeyEditor({
  entry,
  onSaved,
}: {
  entry: RuntimeConfigEffective<RuntimeConfigKey>;
  onSaved: () => void;
}): React.ReactElement {
  const [state, setState] = useState<EditorState>({
    raw: encodeValue(entry.value),
    error: null,
    saving: false,
  });

  const isJson = entry.key === "category_provider_overrides";

  const handleSave = async (): Promise<void> => {
    const parsed = parseForKey(entry.key, state.raw);
    if (!parsed.ok) {
      setState((s) => ({ ...s, error: parsed.error }));
      return;
    }
    setState((s) => ({ ...s, error: null, saving: true }));
    try {
      const res = await fetch(
        `/api/scion/runtime-config/${encodeURIComponent(entry.key)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: parsed.value }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setState((s) => ({
          ...s,
          saving: false,
          error: body?.error ?? `HTTP ${res.status}`,
        }));
        return;
      }
      setState((s) => ({ ...s, saving: false, error: null }));
      onSaved();
    } catch (err) {
      setState((s) => ({
        ...s,
        saving: false,
        error: err instanceof Error ? err.message : "save failed",
      }));
    }
  };

  return (
    <div className="runtime-config__row">
      <div className="runtime-config__row-header">
        <span className="runtime-config__key">{entry.key}</span>
        <span className="runtime-config__source">source={entry.source}</span>
        {entry.updatedBy ? (
          <span className="runtime-config__meta">by {entry.updatedBy}</span>
        ) : null}
      </div>
      {isJson ? (
        <textarea
          className="runtime-config__textarea"
          rows={5}
          value={state.raw}
          onChange={(e) =>
            setState((s) => ({ ...s, raw: e.target.value, error: null }))
          }
        />
      ) : (
        <input
          type="number"
          className="runtime-config__input"
          step={entry.key === "confidence_threshold" ? "0.01" : "1"}
          value={state.raw}
          onChange={(e) =>
            setState((s) => ({ ...s, raw: e.target.value, error: null }))
          }
        />
      )}
      <div className="runtime-config__row-actions">
        <button
          type="button"
          className="runtime-config__save"
          onClick={() => void handleSave()}
          disabled={state.saving}
        >
          {state.saving ? "Saving…" : "Save"}
        </button>
        {state.error ? (
          <span className="runtime-config__error">{state.error}</span>
        ) : null}
      </div>
    </div>
  );
}

export default function RuntimeConfigPanel(): React.ReactElement {
  const { data, error, isLoading } = useSWR<ScionRuntimeConfigResponse>(
    RUNTIME_CONFIG_KEY,
    fetcher,
    { revalidateOnFocus: false },
  );

  const handleSaved = (): void => {
    void mutate(RUNTIME_CONFIG_KEY);
  };

  if (isLoading) {
    return <div className="runtime-config">Loading runtime config…</div>;
  }
  if (error || !data) {
    return (
      <div className="runtime-config">
        <div className="scion-error-banner">
          Failed to load runtime config:{" "}
          {String((error as Error | undefined)?.message ?? "unknown")}
        </div>
      </div>
    );
  }

  return (
    <div className="runtime-config">
      <h3 className="ops-section-title">Runtime configuration</h3>
      {data.entries.map((entry) => (
        <KeyEditor key={entry.key} entry={entry} onSaved={handleSaved} />
      ))}
    </div>
  );
}
