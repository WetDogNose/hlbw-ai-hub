"use client";

// Pass 23 — SCION MCP tool browser.
//
// Lists MCP servers from ConfigPanel's data source (`/api/scion/config` →
// `ConfigSnapshot.mcpServers`). Expanding a server lazily fires
// GET /api/scion/mcp/[server]/tools which spawns the server, calls
// `tools/list`, and closes. Tool catalog is cached server-side for 60s.

import React, { useState } from "react";
import useSWR from "swr";
import type { ScionConfigResponse } from "@/app/api/scion/config/route";
import type { ScionMcpToolsResponse } from "@/app/api/scion/mcp/[server]/tools/route";

const fetcher = async (url: string): Promise<ScionConfigResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as ScionConfigResponse;
};

const toolsFetcher = async (url: string): Promise<ScionMcpToolsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as ScionMcpToolsResponse;
};

function ServerTools({ server }: { server: string }): React.ReactElement {
  const { data, error, isLoading } = useSWR<ScionMcpToolsResponse>(
    `/api/scion/mcp/${encodeURIComponent(server)}/tools`,
    toolsFetcher,
    { revalidateOnFocus: false },
  );
  if (isLoading) return <div className="mcp-tools__loading">Loading…</div>;
  if (error || !data) {
    return (
      <div className="scion-error-banner">
        Failed: {String((error as Error | undefined)?.message ?? "unknown")}
      </div>
    );
  }
  if (data.tools.length === 0) {
    return <div className="mcp-tools__empty">(no tools reported)</div>;
  }
  return (
    <ul className="mcp-tools__list">
      {data.tools.map((t) => (
        <li key={t.name} className="mcp-tools__item">
          <span className="mcp-tools__name">{t.name}</span>
          {t.description ? (
            <span className="mcp-tools__description">
              {" — "}
              {t.description}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function MCPToolBrowser(): React.ReactElement {
  const { data, error, isLoading } = useSWR<ScionConfigResponse>(
    "/api/scion/config",
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30_000 },
  );
  const [openServer, setOpenServer] = useState<string | null>(null);

  if (isLoading) return <div className="mcp-tools">Loading servers…</div>;
  if (error || !data) {
    return (
      <div className="mcp-tools">
        <div className="scion-error-banner">
          Failed to load MCP server list:{" "}
          {String((error as Error | undefined)?.message ?? "unknown")}
        </div>
      </div>
    );
  }

  return (
    <div className="mcp-tools">
      <h3 className="ops-section-title">MCP tool browser</h3>
      {data.mcpServers.length === 0 ? (
        <div className="mcp-tools__empty">No MCP servers registered.</div>
      ) : null}
      {data.mcpServers.map((s) => {
        const isOpen = openServer === s.name;
        return (
          <div key={s.name} className="mcp-tools__server">
            <button
              type="button"
              className="mcp-tools__server-header"
              onClick={() => setOpenServer(isOpen ? null : s.name)}
            >
              <span className="mcp-tools__server-name">{s.name}</span>
              <span className="mcp-tools__server-toggle">
                {isOpen ? "▼" : "▶"}
              </span>
            </button>
            {isOpen ? <ServerTools server={s.name} /> : null}
          </div>
        );
      })}
    </div>
  );
}
