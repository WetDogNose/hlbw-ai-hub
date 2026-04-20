// Pass 23 — GET /api/scion/mcp/[server]/tools
//
// Spawns the configured MCP server via stdio, calls `tools/list`, closes the
// transport, and returns `{ name, description }[]`. Results are cached in
// memory for 60 seconds per server.
//
// Hard rules:
//   - Server name is whitelisted against `.gemini/mcp.json`.
//   - Admin-only (enumerates internal tool surfaces).

import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { requireAdmin } from "@/lib/orchestration/auth-guard";

export interface ScionMcpToolEntry {
  name: string;
  description: string | null;
}

export interface ScionMcpToolsResponse {
  server: string;
  tools: ScionMcpToolEntry[];
  cachedAt: string;
}

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

const CACHE_TTL_MS = 60_000;
type CacheEntry = { body: ScionMcpToolsResponse; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function loadMcpConfig(): Record<string, McpServerConfig> {
  const cfgPath = path.resolve(process.cwd(), ".gemini", "mcp.json");
  if (!fs.existsSync(cfgPath)) return {};
  try {
    const raw = fs.readFileSync(cfgPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "mcpServers" in (parsed as Record<string, unknown>)
    ) {
      const servers = (parsed as { mcpServers?: unknown }).mcpServers;
      if (servers && typeof servers === "object") {
        return servers as Record<string, McpServerConfig>;
      }
    }
    return {};
  } catch (err) {
    console.warn(
      "[mcp-tools-route] failed to read .gemini/mcp.json:",
      err instanceof Error ? err.message : String(err),
    );
    return {};
  }
}

/** Exposed for tests. */
export function __clearMcpToolsCache(): void {
  cache.clear();
}

export async function GET(
  _req: Request,
  context:
    | { params: Promise<{ server: string }> }
    | { params: { server: string } },
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const paramsMaybePromise = (context as { params: unknown }).params;
  const params =
    paramsMaybePromise instanceof Promise
      ? await paramsMaybePromise
      : (paramsMaybePromise as { server: string });
  const server = params.server;
  if (!server || typeof server !== "string") {
    return NextResponse.json(
      { error: "server name required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const config = loadMcpConfig();
  const entry = config[server];
  if (!entry || typeof entry.command !== "string") {
    return NextResponse.json(
      { error: `unknown MCP server: ${server}` },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const now = Date.now();
  const cached = cache.get(server);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.body, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const transport = new StdioClientTransport({
      command: entry.command,
      args: entry.args ?? [],
      ...(entry.env ? { env: entry.env } : {}),
      stderr: "pipe",
    });
    const client = new Client(
      { name: "scion-mcp-browser", version: "0.23.0" },
      { capabilities: {} },
    );
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const mapped: ScionMcpToolEntry[] = tools.map((t) => ({
        name: t.name,
        description: t.description ?? null,
      }));
      const body: ScionMcpToolsResponse = {
        server,
        tools: mapped,
        cachedAt: new Date(now).toISOString(),
      };
      cache.set(server, { body, expiresAt: now + CACHE_TTL_MS });
      return NextResponse.json(body, {
        headers: { "Cache-Control": "no-store" },
      });
    } finally {
      try {
        await client.close();
      } catch {
        /* ignore close errors */
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "tools/list failed";
    console.error("/api/scion/mcp/[server]/tools error:", err);
    return NextResponse.json(
      { error: message, server },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
