// Pass 23 — PUT /api/scion/runtime-config/[key] unit tests.
//
// admin 200 / non-admin 403 / unauth 401 / invalid key 400 / invalid value 400.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const upsertMock = jest.fn<(args: unknown) => Promise<unknown>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    runtimeConfig: {
      upsert: (args: unknown) =>
        (upsertMock as unknown as (a: unknown) => Promise<unknown>)(args),
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

import { PUT } from "../route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

function req(body: unknown): Request {
  return new Request("http://localhost/api/scion/runtime-config/cycle_cap", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  upsertMock.mockReset();
  writeMock.mockReset();
  upsertMock.mockResolvedValue({});
  writeMock.mockResolvedValue("m-1");
});

describe("PUT /api/scion/runtime-config/[key]", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await PUT(req({ value: 3 }), {
      params: { key: "cycle_cap" },
    });
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await PUT(req({ value: 3 }), {
      params: { key: "cycle_cap" },
    });
    expect(res.status).toBe(403);
  });

  it("400 unknown key", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PUT(req({ value: 3 }), {
      params: { key: "not_a_real_key" },
    });
    expect(res.status).toBe(400);
  });

  it("400 missing value", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PUT(req({}), {
      params: { key: "cycle_cap" },
    });
    expect(res.status).toBe(400);
  });

  it("400 invalid value (validator)", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PUT(req({ value: 99 }), {
      params: { key: "cycle_cap" },
    });
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("200 + audit on valid write", async () => {
    getIapUserMock.mockResolvedValue(admin);
    const res = await PUT(req({ value: 3 }), {
      params: { key: "cycle_cap" },
    });
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
