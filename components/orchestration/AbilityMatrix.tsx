"use client";

// Pass 21 — SCION ability matrix.
//
// Props: optional `category` string. If absent: lists all categories from the
// config rubric registry as collapsible rows. Each expanded row fetches the
// per-category abilities lazily.

import React, { useState } from "react";
import useSWR from "swr";
import type { AbilitySnapshot } from "@/lib/orchestration/introspection";
import type { ScionConfigResponse } from "@/app/api/scion/config/route";

const configFetcher = async (url: string): Promise<ScionConfigResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as ScionConfigResponse;
};

const abilityFetcher = async (url: string): Promise<AbilitySnapshot> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as AbilitySnapshot;
};

function AbilityDetails({
  category,
}: {
  category: string;
}): React.ReactElement {
  const { data, error, isLoading } = useSWR<AbilitySnapshot>(
    `/api/scion/abilities?category=${encodeURIComponent(category)}`,
    abilityFetcher,
    { revalidateOnFocus: false },
  );
  if (isLoading) return <div className="ability-row__details">Loading…</div>;
  if (error || !data) {
    return (
      <div className="ability-row__details">
        <div className="scion-error-banner">
          Failed to load abilities for {category}
        </div>
      </div>
    );
  }
  return (
    <div className="ability-row__details">
      <div>
        <strong>Rubric:</strong> {data.rubric.name} — {data.rubric.description}
      </div>
      <ul>
        {data.rubric.checks.map((c) => (
          <li key={c.id}>
            <code>{c.id}</code>: {c.description}
          </li>
        ))}
      </ul>
      <div>
        <strong>Provider:</strong>{" "}
        <span className="ability-row__provider">{data.provider}</span>
      </div>
      <div>
        <strong>Tools ({data.toolCatalog.length}):</strong>
      </div>
      {data.toolCatalog.map((t) => (
        <div key={t.name} className="ability-tool">
          <span className="ability-tool__name">{t.name}</span>
          {t.readOnlyAllowed ? (
            <span className="ability-tool__badge-ro">RO</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export interface AbilityMatrixProps {
  category?: string;
}

export default function AbilityMatrix({
  category,
}: AbilityMatrixProps): React.ReactElement {
  const { data: config } = useSWR<ScionConfigResponse>(
    "/api/scion/config",
    configFetcher,
    { refreshInterval: 10_000, revalidateOnFocus: false },
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    category ? { [category]: true } : {},
  );

  const categories = category
    ? [category]
    : (config?.rubricRegistry ?? []).map((r) => r.category);

  return (
    <div className="ability-matrix">
      {categories.length === 0 ? (
        <div className="memory-browser__empty">No categories registered.</div>
      ) : null}
      {categories.map((cat) => (
        <div key={cat} className="ability-row">
          <button
            type="button"
            className="ability-row__summary"
            onClick={() =>
              setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }))
            }
          >
            <span>{cat}</span>
            <span className="config-panel__row-meta">
              {expanded[cat] ? "hide" : "show"}
            </span>
          </button>
          {expanded[cat] ? <AbilityDetails category={cat} /> : null}
        </div>
      ))}
    </div>
  );
}
