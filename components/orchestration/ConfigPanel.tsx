"use client";

// Pass 21 — SCION configuration / introspection panel.
//
// Fetches /api/scion/config with SWR (5s refresh). Renders four sections:
// Providers, Embeddings + MCP servers, Env sanity, Rubric registry.

import React from "react";
import useSWR from "swr";
import type { ScionConfigResponse } from "@/app/api/scion/config/route";

const fetcher = async (url: string): Promise<ScionConfigResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as ScionConfigResponse;
};

function Pill({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}): React.ReactElement {
  return (
    <span
      className={
        ok ? "status-pill status-pill--ok" : "status-pill status-pill--err"
      }
    >
      {label}
    </span>
  );
}

export default function ConfigPanel(): React.ReactElement {
  const { data, error, isLoading } = useSWR<ScionConfigResponse>(
    "/api/scion/config",
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: false },
  );

  if (isLoading) {
    return <div className="config-panel">Loading configuration…</div>;
  }
  if (error || !data) {
    return (
      <div className="config-panel">
        <div className="scion-error-banner">
          Failed to load config: {String((error as Error | undefined)?.message)}
        </div>
      </div>
    );
  }

  return (
    <div className="config-panel">
      <section className="config-panel__section">
        <h3 className="config-panel__section-title">Providers</h3>
        {data.providers.map((p) => (
          <div key={p.name} className="config-panel__row">
            <span className="config-panel__row-label">{p.name}</span>
            <span>
              <Pill ok={p.available} label={p.available ? "OK" : "MISSING"} />
              {p.reason ? (
                <span className="config-panel__row-meta"> {p.reason}</span>
              ) : null}
            </span>
          </div>
        ))}
        <div className="config-panel__row">
          <span className="config-panel__row-label">defaultProvider</span>
          <span className="config-panel__row-meta">{data.defaultProvider}</span>
        </div>
        {Object.entries(data.categoryOverrides).map(([cat, prov]) => (
          <div key={cat} className="config-panel__row">
            <span className="config-panel__row-label">override: {cat}</span>
            <span className="config-panel__row-meta">{prov}</span>
          </div>
        ))}
      </section>

      <section className="config-panel__section">
        <h3 className="config-panel__section-title">
          Embeddings and MCP servers
        </h3>
        <div className="config-panel__row">
          <span className="config-panel__row-label">
            {data.embeddings.name}
          </span>
          <span>
            <Pill
              ok={data.embeddings.available}
              label={data.embeddings.available ? "READY" : "DOWN"}
            />
            <span className="config-panel__row-meta">
              {" "}
              dim={data.embeddings.dim}
            </span>
          </span>
        </div>
        {data.mcpServers.length === 0 ? (
          <div className="config-panel__row">
            <span className="config-panel__row-meta">
              No MCP servers registered.
            </span>
          </div>
        ) : null}
        {data.mcpServers.map((s) => (
          <div key={s.name} className="config-panel__row">
            <span className="config-panel__row-label">{s.name}</span>
            <span>
              <Pill
                ok={s.reachable}
                label={s.reachable ? "REACHABLE" : "UNKNOWN"}
              />
            </span>
          </div>
        ))}
      </section>

      <section className="config-panel__section">
        <h3 className="config-panel__section-title">Env sanity</h3>
        {data.envSanity.map((entry) => (
          <div key={entry.key} className="config-panel__row">
            <span className="config-panel__row-label">{entry.key}</span>
            <span>
              <Pill
                ok={entry.present}
                label={entry.present ? "PRESENT" : "MISSING"}
              />
              {entry.sensitive ? (
                <span className="config-panel__row-meta"> sensitive</span>
              ) : null}
            </span>
          </div>
        ))}
      </section>

      <section className="config-panel__section">
        <h3 className="config-panel__section-title">Rubric registry</h3>
        {data.rubricRegistry.map((r) => (
          <div key={r.category} className="config-panel__row">
            <span className="config-panel__row-label">{r.category}</span>
            <span className="config-panel__row-meta">
              {r.checkCount} checks
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
