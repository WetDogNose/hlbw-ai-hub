"use client";

// Pass 24 — SCION template browser.
//
// Fetches `GET /api/scion/templates` (existing route; response shape:
// `{ templates: Array<{ name: string; content: string }> }`, or
// `{ error: string }` with 500 when the external templates dir is missing).
// On select, raises the selected template via `onSelect(name, content)` so
// the parent dashboard can pre-fill `ExecuteDialog`.

import React, { useState } from "react";
import useSWR from "swr";

export interface TemplateBrowserTemplate {
  name: string;
  content: string;
}

export interface ScionTemplatesResponse {
  templates: TemplateBrowserTemplate[];
}

export interface TemplateBrowserProps {
  onSelect?: (template: TemplateBrowserTemplate) => void;
}

const fetcher = async (url: string): Promise<ScionTemplatesResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as ScionTemplatesResponse;
};

export default function TemplateBrowser({
  onSelect,
}: TemplateBrowserProps): React.ReactElement {
  const { data, error, isLoading } = useSWR<ScionTemplatesResponse>(
    "/api/scion/templates",
    fetcher,
    { revalidateOnFocus: false },
  );
  const [expandedName, setExpandedName] = useState<string | null>(null);

  return (
    <div className="template-browser">
      <h3 className="ops-section-title">Template browser</h3>
      {isLoading ? <div>Loading templates…</div> : null}
      {error ? (
        <div className="scion-error-banner">
          Failed to load templates:{" "}
          {String((error as Error | undefined)?.message ?? "unknown")}
        </div>
      ) : null}
      {data && data.templates.length === 0 ? (
        <div className="template-browser__empty">
          No templates found in the scion templates dir.
        </div>
      ) : null}
      {data?.templates.map((t) => {
        const isOpen = expandedName === t.name;
        return (
          <div key={t.name} className="template-browser__row">
            <div className="template-browser__row-header">
              <span className="template-browser__name">{t.name}</span>
              <div className="template-browser__row-actions">
                <button
                  type="button"
                  className="template-browser__button"
                  onClick={() =>
                    setExpandedName((prev) => (prev === t.name ? null : t.name))
                  }
                >
                  {isOpen ? "Hide" : "Peek"}
                </button>
                {onSelect ? (
                  <button
                    type="button"
                    className="template-browser__button template-browser__button--primary"
                    onClick={() => onSelect(t)}
                  >
                    Use template
                  </button>
                ) : null}
              </div>
            </div>
            {isOpen ? (
              <pre className="template-browser__content">{t.content}</pre>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
