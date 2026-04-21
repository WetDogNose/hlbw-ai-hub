import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";

const queryRaw = jest.fn<() => Promise<unknown>>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: { $queryRaw: queryRaw },
}));

import { GET } from "../route";
import { resetDispatcherCache } from "@/lib/orchestration/dispatchers";

describe("GET /api/scion/engine-health", () => {
  const originalMode = process.env.DISPATCHER_MODE;

  beforeEach(() => {
    queryRaw.mockReset();
    resetDispatcherCache();
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.DISPATCHER_MODE;
    else process.env.DISPATCHER_MODE = originalMode;
    resetDispatcherCache();
  });

  it('returns status="remote" in DISPATCHER_MODE=noop without probing the DB', async () => {
    process.env.DISPATCHER_MODE = "noop";
    resetDispatcherCache();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dispatcherMode: string;
      status: string;
    };
    expect(body.dispatcherMode).toBe("noop");
    expect(body.status).toBe("remote");
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('returns status="online" when DB probe succeeds (docker mode)', async () => {
    process.env.DISPATCHER_MODE = "docker";
    resetDispatcherCache();
    queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dispatcherMode: string;
      status: string;
    };
    expect(body.dispatcherMode).toBe("docker");
    expect(body.status).toBe("online");
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns 503 + status="degraded" when DB probe throws', async () => {
    process.env.DISPATCHER_MODE = "docker";
    resetDispatcherCache();
    queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      dispatcherMode: string;
      status: string;
      message: string;
    };
    expect(body.dispatcherMode).toBe("docker");
    expect(body.status).toBe("degraded");
    expect(body.message).toContain("connection refused");
  });
});
