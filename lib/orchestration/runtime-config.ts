// Pass 23 — Runtime-configuration loader.
//
// Reads/writes UI-editable knobs from the `runtime_config` Prisma table.
// Lookup order for each key:
//   1. `runtime_config` row (source: "db").
//   2. `fallbackEnv` env var (source: "env") — callers pass the env var name.
//   3. Hardcoded default (source: "default").
//
// The migration that creates `runtime_config` is user-gated (decisions.md D5).
// Until applied, `getRuntimeConfig` tolerates table-missing errors and falls
// through to env/default so the app continues to boot.
//
// Writes (setRuntimeConfig) validate per-key and persist both the value and
// the updating actor's email for audit. Callers should also call
// `recordAdminAction` at the route layer — this module does not reach into
// the audit module to avoid a cycle.

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type RuntimeConfigKey =
  | "category_provider_overrides"
  | "cycle_cap"
  | "confidence_threshold"
  | "exploration_budget"
  | "watchdog_timeout_minutes";

export const RUNTIME_CONFIG_KEYS: ReadonlyArray<RuntimeConfigKey> = [
  "category_provider_overrides",
  "cycle_cap",
  "confidence_threshold",
  "exploration_budget",
  "watchdog_timeout_minutes",
];

export interface RuntimeConfigEffective<K extends RuntimeConfigKey> {
  key: K;
  value: unknown;
  source: "db" | "env" | "default";
  updatedAt?: string;
  updatedBy?: string | null;
}

// Hardcoded defaults the loader returns when neither DB nor env is set.
const HARDCODED_DEFAULTS: Record<RuntimeConfigKey, unknown> = {
  category_provider_overrides: {},
  cycle_cap: 3,
  confidence_threshold: 0.85,
  exploration_budget: 8,
  watchdog_timeout_minutes: 30,
};

// Env variable name the loader will consult when no DB row exists. Exposed
// here so `listRuntimeConfig` can walk every key without callers knowing the
// mapping.
const ENV_MAPPING: Record<RuntimeConfigKey, string> = {
  category_provider_overrides: "CATEGORY_PROVIDER_OVERRIDES",
  cycle_cap: "SCION_CYCLE_CAP",
  confidence_threshold: "SCION_CONFIDENCE_THRESHOLD",
  exploration_budget: "SCION_EXPLORATION_BUDGET",
  watchdog_timeout_minutes: "SCION_WATCHDOG_TIMEOUT_MINUTES",
};

const KNOWN_PROVIDERS = new Set(["gemini", "paperclip", "ollama"]);
const KNOWN_CATEGORIES = new Set([
  "1_qa",
  "2_source_control",
  "3_cloud",
  "4_db",
  "5_bizops",
  "default",
]);

function parseEnvValue(key: RuntimeConfigKey, raw: string): unknown {
  if (key === "category_provider_overrides") {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (
    key === "cycle_cap" ||
    key === "exploration_budget" ||
    key === "watchdog_timeout_minutes"
  ) {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  if (key === "confidence_threshold") {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  return raw;
}

/**
 * Validate a value against the per-key schema. Throws with a stable
 * `invalid value for key X: ...` message the route layer surfaces as 400.
 */
export function validateRuntimeConfigValue(
  key: RuntimeConfigKey,
  value: unknown,
): void {
  switch (key) {
    case "category_provider_overrides": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`invalid value for key ${key}: must be an object`);
      }
      for (const [category, provider] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (!KNOWN_CATEGORIES.has(category)) {
          throw new Error(
            `invalid value for key ${key}: unknown category ${category}`,
          );
        }
        if (typeof provider !== "string" || !KNOWN_PROVIDERS.has(provider)) {
          throw new Error(
            `invalid value for key ${key}: provider for ${category} must be one of gemini,paperclip,ollama`,
          );
        }
      }
      return;
    }
    case "cycle_cap": {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > 10
      ) {
        throw new Error(`invalid value for key ${key}: must be integer 1..10`);
      }
      return;
    }
    case "confidence_threshold": {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1
      ) {
        throw new Error(`invalid value for key ${key}: must be number 0..1`);
      }
      return;
    }
    case "exploration_budget": {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 32
      ) {
        throw new Error(`invalid value for key ${key}: must be integer 0..32`);
      }
      return;
    }
    case "watchdog_timeout_minutes": {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > 480
      ) {
        throw new Error(`invalid value for key ${key}: must be integer 1..480`);
      }
      return;
    }
    default: {
      // exhaustive check
      const _never: never = key;
      throw new Error(`unknown runtime config key: ${String(_never)}`);
    }
  }
}

type RuntimeConfigRow = {
  key: string;
  value: unknown;
  updatedAt: Date;
  updatedBy: string | null;
};

async function readDbRow(
  key: RuntimeConfigKey,
): Promise<RuntimeConfigRow | null> {
  try {
    // Cast through unknown — the prisma client types are generated; until the
    // migration runs, the runtime `runtimeConfig` delegate may be absent in
    // the client type. The `as unknown as` handshake keeps the loader boot-safe
    // regardless of whether the user has applied the migration yet.
    const client = prisma as unknown as {
      runtimeConfig?: {
        findUnique: (args: {
          where: { key: string };
        }) => Promise<RuntimeConfigRow | null>;
      };
    };
    if (!client.runtimeConfig) return null;
    const row = await client.runtimeConfig.findUnique({ where: { key } });
    return row ?? null;
  } catch (err) {
    // Table-missing (migration not applied) / other DB error — fall through.
    console.warn(
      `[runtime-config] readDbRow(${key}) failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Return the effective value for a runtime-config key. Never throws; on any
 * failure the loader falls back to the hardcoded default so the app keeps
 * booting.
 *
 * @param key one of the enumerated runtime-config keys
 * @param fallbackEnv env var name to consult when no DB row exists
 * @param hardcodedDefault final fallback when neither DB nor env is set
 */
export async function getRuntimeConfig<K extends RuntimeConfigKey>(
  key: K,
  fallbackEnv: string,
  hardcodedDefault: unknown,
): Promise<RuntimeConfigEffective<K>> {
  const row = await readDbRow(key);
  if (row) {
    return {
      key,
      value: row.value,
      source: "db",
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  }
  const envRaw = process.env[fallbackEnv];
  if (typeof envRaw === "string" && envRaw.length > 0) {
    const parsed = parseEnvValue(key, envRaw);
    if (parsed !== undefined) {
      return { key, value: parsed, source: "env" };
    }
  }
  return { key, value: hardcodedDefault, source: "default" };
}

/**
 * Validate and persist a runtime-config key. Throws on invalid payload —
 * caller is expected to surface the error message as a 400 response.
 */
export async function setRuntimeConfig(
  key: RuntimeConfigKey,
  value: unknown,
  actorEmail: string,
): Promise<void> {
  if (!RUNTIME_CONFIG_KEYS.includes(key)) {
    throw new Error(`unknown runtime config key: ${key}`);
  }
  validateRuntimeConfigValue(key, value);
  const client = prisma as unknown as {
    runtimeConfig?: {
      upsert: (args: {
        where: { key: string };
        create: {
          key: string;
          value: Prisma.InputJsonValue;
          updatedBy: string;
        };
        update: { value: Prisma.InputJsonValue; updatedBy: string };
      }) => Promise<RuntimeConfigRow>;
    };
  };
  if (!client.runtimeConfig) {
    throw new Error(
      "runtime_config table missing — user must run `npx prisma migrate dev --name runtime_config`",
    );
  }
  await client.runtimeConfig.upsert({
    where: { key },
    create: {
      key,
      value: value as Prisma.InputJsonValue,
      updatedBy: actorEmail,
    },
    update: {
      value: value as Prisma.InputJsonValue,
      updatedBy: actorEmail,
    },
  });
}

/** Walk every enumerated key and return its effective value. */
export async function listRuntimeConfig(): Promise<
  RuntimeConfigEffective<RuntimeConfigKey>[]
> {
  const out: RuntimeConfigEffective<RuntimeConfigKey>[] = [];
  for (const key of RUNTIME_CONFIG_KEYS) {
    const eff = await getRuntimeConfig(
      key,
      ENV_MAPPING[key],
      HARDCODED_DEFAULTS[key],
    );
    out.push(eff);
  }
  return out;
}

/** Exposed for tests that need to assert defaults without mocking the map. */
export function getHardcodedDefault(key: RuntimeConfigKey): unknown {
  return HARDCODED_DEFAULTS[key];
}

/** Exposed for tests. */
export function getEnvName(key: RuntimeConfigKey): string {
  return ENV_MAPPING[key];
}
