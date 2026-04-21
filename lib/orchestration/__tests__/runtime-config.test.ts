// Pass 23 — runtime-config loader tests.
//
// Covers the three sources enumerated in the loader:
//   - "default" when DB row absent + no env var
//   - "db" when DB row is present
//   - "env" when env var set but no DB row
// Plus the per-key validator in `setRuntimeConfig`.

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

const findUniqueMock =
  jest.fn<(args: { where: { key: string } }) => Promise<unknown | null>>();
const upsertMock = jest.fn<(args: unknown) => Promise<unknown>>();

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
      upsert: (args: unknown) =>
        (upsertMock as unknown as (a: unknown) => Promise<unknown>)(args),
    },
  },
}));

import {
  getRuntimeConfig,
  setRuntimeConfig,
  listRuntimeConfig,
  validateRuntimeConfigValue,
} from "../runtime-config";

beforeEach(() => {
  findUniqueMock.mockReset();
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({});
  delete process.env.TEST_CYCLE_CAP_ENV;
  delete process.env.TEST_OVERRIDES_ENV;
});

describe("runtime-config loader", () => {
  it("returns source=default when DB row absent and no env var set", async () => {
    findUniqueMock.mockResolvedValue(null);
    const eff = await getRuntimeConfig("cycle_cap", "TEST_CYCLE_CAP_ENV", 3);
    expect(eff.source).toBe("default");
    expect(eff.value).toBe(3);
  });

  it("returns source=env when env var set but no DB row", async () => {
    findUniqueMock.mockResolvedValue(null);
    process.env.TEST_CYCLE_CAP_ENV = "5";
    const eff = await getRuntimeConfig("cycle_cap", "TEST_CYCLE_CAP_ENV", 3);
    expect(eff.source).toBe("env");
    expect(eff.value).toBe(5);
  });

  it("returns source=db when DB row present (overrides env)", async () => {
    findUniqueMock.mockResolvedValue({
      key: "cycle_cap",
      value: 7,
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      updatedBy: "admin@example",
    });
    process.env.TEST_CYCLE_CAP_ENV = "5";
    const eff = await getRuntimeConfig("cycle_cap", "TEST_CYCLE_CAP_ENV", 3);
    expect(eff.source).toBe("db");
    expect(eff.value).toBe(7);
    expect(eff.updatedBy).toBe("admin@example");
  });

  it("parses env JSON for category_provider_overrides", async () => {
    findUniqueMock.mockResolvedValue(null);
    process.env.TEST_OVERRIDES_ENV = '{"1_qa":"paperclip"}';
    const eff = await getRuntimeConfig(
      "category_provider_overrides",
      "TEST_OVERRIDES_ENV",
      {},
    );
    expect(eff.source).toBe("env");
    expect(eff.value).toEqual({ "1_qa": "paperclip" });
  });

  it("listRuntimeConfig walks every enumerated key", async () => {
    findUniqueMock.mockResolvedValue(null);
    const entries = await listRuntimeConfig();
    expect(entries.map((e) => e.key).sort()).toEqual([
      "budget_daily_ceiling_tokens",
      "category_provider_overrides",
      "confidence_threshold",
      "cycle_cap",
      "dispatch_paused",
      "exploration_budget",
      "pool_warm_count",
      "watchdog_timeout_minutes",
    ]);
  });
});

describe("runtime-config validator", () => {
  it("accepts a valid category_provider_overrides value", () => {
    expect(() =>
      validateRuntimeConfigValue("category_provider_overrides", {
        "1_qa": "paperclip",
        default: "gemini",
      }),
    ).not.toThrow();
  });

  it("rejects unknown category in overrides", () => {
    expect(() =>
      validateRuntimeConfigValue("category_provider_overrides", {
        "6_fiction": "gemini",
      }),
    ).toThrow(/invalid value for key category_provider_overrides/);
  });

  it("rejects unknown provider in overrides", () => {
    expect(() =>
      validateRuntimeConfigValue("category_provider_overrides", {
        "1_qa": "madeup",
      }),
    ).toThrow(/invalid value for key category_provider_overrides/);
  });

  it("rejects non-integer cycle_cap", () => {
    expect(() => validateRuntimeConfigValue("cycle_cap", 2.5)).toThrow(
      /invalid value for key cycle_cap/,
    );
  });

  it("rejects cycle_cap out of range", () => {
    expect(() => validateRuntimeConfigValue("cycle_cap", 20)).toThrow(
      /invalid value for key cycle_cap/,
    );
    expect(() => validateRuntimeConfigValue("cycle_cap", 0)).toThrow(
      /invalid value for key cycle_cap/,
    );
  });

  it("accepts confidence_threshold in [0,1]", () => {
    expect(() =>
      validateRuntimeConfigValue("confidence_threshold", 0.85),
    ).not.toThrow();
    expect(() =>
      validateRuntimeConfigValue("confidence_threshold", -1),
    ).toThrow(/invalid value for key confidence_threshold/);
  });

  it("rejects exploration_budget above 32", () => {
    expect(() => validateRuntimeConfigValue("exploration_budget", 100)).toThrow(
      /invalid value for key exploration_budget/,
    );
  });

  it("rejects watchdog_timeout_minutes below 1", () => {
    expect(() =>
      validateRuntimeConfigValue("watchdog_timeout_minutes", 0),
    ).toThrow(/invalid value for key watchdog_timeout_minutes/);
  });
});

describe("setRuntimeConfig", () => {
  it("throws on invalid value before calling prisma", async () => {
    await expect(setRuntimeConfig("cycle_cap", 999, "admin@x")).rejects.toThrow(
      /invalid value for key cycle_cap/,
    );
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("upserts a valid value with the actor email", async () => {
    await setRuntimeConfig("cycle_cap", 4, "admin@x");
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const call = upsertMock.mock.calls[0][0] as {
      where: { key: string };
      create: { updatedBy: string };
    };
    expect(call.where.key).toBe("cycle_cap");
    expect(call.create.updatedBy).toBe("admin@x");
  });
});
