// POST /api/scion/webhooks/[id]/test unit tests.
//
// Mocks global.fetch to capture the request headers / body and verify the
// X-HLBW-Signature header equals HMAC-SHA256(secret, body) in hex.

import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { createHmac } from "node:crypto";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findUniqueMock = jest.fn<(args: unknown) => Promise<unknown | null>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    webhookConfig: {
      findUnique: (args: unknown) =>
        (findUniqueMock as unknown as (a: unknown) => Promise<unknown | null>)(
          args,
        ),
    },
  },
}));

jest.mock("@/lib/orchestration/memory/PgvectorMemoryStore", () => ({
  __esModule: true,
  getPgvectorMemoryStore: () => ({
    write: (ep: unknown) =>
      (writeMock as unknown as (e: unknown) => Promise<string>)(ep),
  }),
}));

import { POST, TEST_BODY, SIGNATURE_HEADER, signBody } from "../route";

const admin: IapUser = {
  id: "a",
  email: "admin@x",
  name: null,
  role: "ADMIN",
};

function testReq(): Request {
  return new Request("http://localhost/api/scion/webhooks/wh-1/test", {
    method: "POST",
  });
}

const originalFetch = global.fetch;
let fetchMock: jest.MockedFunction<typeof global.fetch>;

beforeEach(() => {
  getIapUserMock.mockReset();
  findUniqueMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("audit-1");
  fetchMock = jest.fn() as jest.MockedFunction<typeof global.fetch>;
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("POST /api/scion/webhooks/[id]/test", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await POST(testReq(), { params: { id: "wh-1" } });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await POST(testReq(), { params: { id: "wh-1" } });
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404 when webhook does not exist", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(null);
    const res = await POST(testReq(), { params: { id: "wh-1" } });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fires POST with correct signature header and body", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const SECRET = "unit-test-secret-0000";
    findUniqueMock.mockResolvedValue({
      id: "wh-1",
      endpoint: "https://hooks.example.com/",
      secret: SECRET,
      isActive: true,
    });
    fetchMock.mockResolvedValue(
      new Response("ok", { status: 200 }) as unknown as Response,
    );

    const res = await POST(testReq(), { params: { id: "wh-1" } });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      status: number;
      durationMs: number;
      responseSnippet: string;
      error?: string;
    };
    expect(body.status).toBe(200);
    expect(body.responseSnippet).toBe("ok");
    expect(body.error).toBeUndefined();
    expect(typeof body.durationMs).toBe("number");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe("https://hooks.example.com/");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(TEST_BODY);

    const expectedSig = createHmac("sha256", SECRET)
      .update(TEST_BODY)
      .digest("hex");
    expect(init.headers[SIGNATURE_HEADER]).toBe(expectedSig);
    // Double-check the exported helper computes the same value.
    expect(signBody(SECRET, TEST_BODY)).toBe(expectedSig);
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("caps response snippet at 2KB", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({
      id: "wh-1",
      endpoint: "https://hooks.example.com/",
      secret: "unit-test-secret-0000",
      isActive: true,
    });
    const big = "x".repeat(5_000);
    fetchMock.mockResolvedValue(
      new Response(big, { status: 200 }) as unknown as Response,
    );
    const res = await POST(testReq(), { params: { id: "wh-1" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { responseSnippet: string };
    expect(body.responseSnippet.length).toBe(2_048);
  });

  it("handles timeout gracefully", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({
      id: "wh-1",
      endpoint: "https://hooks.example.com/",
      secret: "unit-test-secret-0000",
      isActive: true,
    });
    const timeoutErr = new Error("aborted");
    timeoutErr.name = "TimeoutError";
    fetchMock.mockRejectedValue(timeoutErr);

    const res = await POST(testReq(), { params: { id: "wh-1" } });
    // Network / timeout errors still return 200 with error field set so the
    // UI can render the inline diagnostic.
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: number;
      error?: string;
    };
    expect(body.status).toBe(0);
    expect(body.error).toMatch(/timeout/i);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("handles generic network errors gracefully", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({
      id: "wh-1",
      endpoint: "https://hooks.example.com/",
      secret: "unit-test-secret-0000",
      isActive: true,
    });
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await POST(testReq(), { params: { id: "wh-1" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: number; error?: string };
    expect(body.status).toBe(0);
    expect(body.error).toBe("ECONNREFUSED");
  });
});
