// Pass 23 — GET /api/scion/runtime-config unit tests.
//
// Admin 200 / non-admin 403 / unauth 401.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findUniqueMock =
  jest.fn<(args: { where: { key: string } }) => Promise<unknown | null>>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    runtimeConfig: {
      findUnique: (args: { where: { key: string } }) =>
        (
          findUniqueMock as unknown as (a: {
            where: { key: string };
          }) => Promise<unknown | null>
        )(args),
    },
  },
}));

import { GET } from "../route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

beforeEach(() => {
  getIapUserMock.mockReset();
  findUniqueMock.mockReset();
  findUniqueMock.mockResolvedValue(null);
});

describe("GET /api/scion/runtime-config", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("200 admin returns effective entries for all keys", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: Array<{ key: string; source: string }>;
    };
    expect(body.entries).toHaveLength(8);
    expect(body.entries.every((e) => e.source === "default")).toBe(true);
  });
});
