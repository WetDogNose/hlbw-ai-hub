// Pass 23 — DELETE /api/scion/memory/[id] unit tests.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { IapUser } from "@/lib/iap-auth";

const getIapUserMock = jest.fn<() => Promise<IapUser | null>>();
const findUniqueMock = jest.fn<(args: unknown) => Promise<unknown | null>>();
const deleteMock = jest.fn<(args: unknown) => Promise<unknown>>();
const writeMock = jest.fn<(ep: unknown) => Promise<string>>();

jest.mock("@/lib/iap-auth", () => ({
  __esModule: true,
  getIapUser: () =>
    (getIapUserMock as unknown as () => Promise<IapUser | null>)(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    memoryEpisode: {
      findUnique: (args: unknown) =>
        (findUniqueMock as unknown as (a: unknown) => Promise<unknown | null>)(
          args,
        ),
      delete: (args: unknown) =>
        (deleteMock as unknown as (a: unknown) => Promise<unknown>)(args),
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

import { DELETE } from "../route";

const admin: IapUser = {
  id: "a",
  email: "a@x",
  name: null,
  role: "ADMIN",
};

function req(): Request {
  return new Request("http://localhost/api/scion/memory/m-1", {
    method: "DELETE",
  });
}

beforeEach(() => {
  getIapUserMock.mockReset();
  findUniqueMock.mockReset();
  deleteMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue("audit-1");
  deleteMock.mockResolvedValue({});
});

describe("DELETE /api/scion/memory/[id]", () => {
  it("401 unauthenticated", async () => {
    getIapUserMock.mockResolvedValue(null);
    const res = await DELETE(req(), { params: { id: "m-1" } });
    expect(res.status).toBe(401);
  });

  it("403 non-admin", async () => {
    getIapUserMock.mockResolvedValue({ ...admin, role: "USER" });
    const res = await DELETE(req(), { params: { id: "m-1" } });
    expect(res.status).toBe(403);
  });

  it("404 not found", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue(null);
    const res = await DELETE(req(), { params: { id: "m-1" } });
    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("200 + audit on success", async () => {
    getIapUserMock.mockResolvedValue(admin);
    findUniqueMock.mockResolvedValue({ id: "m-1", kind: "decision" });
    const res = await DELETE(req(), { params: { id: "m-1" } });
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
