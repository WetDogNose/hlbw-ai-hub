// Pass 22 — GET /api/scion/me unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

import { GET } from "../route";

beforeEach(() => {
  getIapUserMock.mockReset();
});

describe("GET /api/scion/me", () => {
  it("returns 401 when unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 403 when role is USER", async () => {
    getIapUserMock.mockResolvedValue({
      id: "u",
      email: "u@x",
      name: "u",
      role: "USER",
    });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the IapUser shape when admin", async () => {
    getIapUserMock.mockResolvedValue({
      id: "a",
      email: "a@x",
      name: "Admin",
      role: "ADMIN",
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("a@x");
    expect(body.role).toBe("ADMIN");
  });
});
