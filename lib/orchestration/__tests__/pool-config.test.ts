// Unit tests for resolveWorkerCount.
// Precedence: explicit caller → runtime-config → default (21).
// Clamp: 0..WORKER_COUNT_CEILING (64).

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";

jest.mock("@/lib/orchestration/runtime-config", () => ({
  __esModule: true,
  getRuntimeConfig: jest.fn(),
}));

import { resolveWorkerCount } from "@/lib/orchestration/pool-config";
import { getRuntimeConfig } from "@/lib/orchestration/runtime-config";

// Cast to a loose Mock shape for arbitrary resolved/rejected values.
const mockedGet = getRuntimeConfig as unknown as {
  mockReset: () => void;
  mockResolvedValueOnce: (v: unknown) => void;
  mockRejectedValueOnce: (v: unknown) => void;
};

describe("resolveWorkerCount", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  afterEach(() => {
    mockedGet.mockReset();
  });

  it("returns the hardcoded default (21) when nothing is configured", async () => {
    mockedGet.mockResolvedValueOnce({
      key: "pool_warm_count",
      value: 21,
      source: "default",
    });
    expect(await resolveWorkerCount()).toBe(21);
  });

  it("honours an explicit caller argument without asking runtime-config", async () => {
    expect(await resolveWorkerCount(5)).toBe(5);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("honours a runtime-config value when no explicit arg is passed", async () => {
    mockedGet.mockResolvedValueOnce({
      key: "pool_warm_count",
      value: 7,
      source: "db",
    });
    expect(await resolveWorkerCount()).toBe(7);
  });

  it("clamps values above 64 — bad runtime-config can't runaway-spawn", async () => {
    mockedGet.mockResolvedValueOnce({
      key: "pool_warm_count",
      value: 1000,
      source: "db",
    });
    expect(await resolveWorkerCount()).toBe(64);
  });

  it("clamps explicit args too", async () => {
    expect(await resolveWorkerCount(9999)).toBe(64);
  });

  it("returns 0 when explicitly asked (valid — turns the pool off)", async () => {
    expect(await resolveWorkerCount(0)).toBe(0);
  });

  it("falls back to the hardcoded default if runtime-config throws", async () => {
    mockedGet.mockRejectedValueOnce(new Error("db unreachable"));
    expect(await resolveWorkerCount()).toBe(21);
  });

  it("falls back to default when runtime-config returns a non-number", async () => {
    mockedGet.mockResolvedValueOnce({
      key: "pool_warm_count",
      value: "not a number",
      source: "db",
    });
    expect(await resolveWorkerCount()).toBe(21);
  });
});
