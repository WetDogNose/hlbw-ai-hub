// Pass 23 — GET /api/scion/mcp/[server]/tools unit tests.
//
// admin 200 / non-admin 403 / unauth 401 / unknown server 404.
// Mocks the SDK Client to return 2 fake tools; verifies parsing + caching.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const listToolsMock = jest.fn<() => Promise<{ tools: unknown[] }>>();
const connectMock = jest.fn<(transport: unknown) => Promise<void>>();
const closeMock = jest.fn<() => Promise<void>>();
const existsSyncMock = jest.fn<(p: string) => boolean>();
const readFileSyncMock = jest.fn<(p: string, enc: string) => string>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  __esModule: true,
  Client: class {
    connect = (t: unknown): Promise<void> =>
      (connectMock as unknown as (x: unknown) => Promise<void>)(t);
    listTools = (): Promise<{ tools: unknown[] }> =>
      (listToolsMock as unknown as () => Promise<{ tools: unknown[] }>)();
    close = (): Promise<void> =>
      (closeMock as unknown as () => Promise<void>)();
  },
}));

jest.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  __esModule: true,
  StdioClientTransport: class {
    constructor(_args: unknown) {}
  },
}));

jest.mock("fs", () => ({
  __esModule: true,
  default: {
    existsSync: (p: string) =>
      (existsSyncMock as unknown as (x: string) => boolean)(p),
    readFileSync: (p: string, enc: string) =>
      (readFileSyncMock as unknown as (x: string, e: string) => string)(p, enc),
  },
}));

import { GET, __clearMcpToolsCache } from "../route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

function req(): Request {
  return new Request("http://localhost/api/scion/mcp/fake-server/tools");
}

const fakeConfig = JSON.stringify({
  mcpServers: {
    "fake-server": {
      command: "node",
      args: ["server.js"],
    },
  },
});

beforeEach(() => {
  getIapUserMock.mockReset();
  listToolsMock.mockReset();
  connectMock.mockReset();
  closeMock.mockReset();
  existsSyncMock.mockReset();
  readFileSyncMock.mockReset();
  __clearMcpToolsCache();
  connectMock.mockResolvedValue();
  closeMock.mockResolvedValue();
  existsSyncMock.mockReturnValue(true);
  readFileSyncMock.mockReturnValue(fakeConfig);
  listToolsMock.mockResolvedValue({
    tools: [
      { name: "alpha", description: "first" },
      { name: "beta", description: "second" },
    ],
  });
});

describe("GET /api/scion/mcp/[server]/tools", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await GET(req(), { params: { server: "fake-server" } });
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await GET(req(), { params: { server: "fake-server" } });
    expect(res.status).toBe(403);
  });

  it("404 unknown server", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await GET(req(), { params: { server: "missing" } });
    expect(res.status).toBe(404);
  });

  it("200 returns parsed tool entries", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await GET(req(), { params: { server: "fake-server" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      server: string;
      tools: Array<{ name: string; description: string | null }>;
    };
    expect(body.server).toBe("fake-server");
    expect(body.tools).toEqual([
      { name: "alpha", description: "first" },
      { name: "beta", description: "second" },
    ]);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("second call within TTL hits the cache (no second spawn)", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const first = await GET(req(), { params: { server: "fake-server" } });
    expect(first.status).toBe(200);
    const second = await GET(req(), { params: { server: "fake-server" } });
    expect(second.status).toBe(200);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(listToolsMock).toHaveBeenCalledTimes(1);
  });
});
