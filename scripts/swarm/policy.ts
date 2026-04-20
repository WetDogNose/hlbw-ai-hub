// Swarm Policy Configuration
// Controls capacity, retention, and operational limits.

// Pass 17 — parses the optional `CATEGORY_PROVIDER_OVERRIDES` env var so
// operators can pin a provider per agent category (e.g. route `1_qa` to
// the local Paperclip LiteLLM proxy while keeping cloud providers for
// other categories). The env var is a JSON object `{ "1_qa": "paperclip" }`.
// Invalid JSON is logged and ignored — we never let bad env kill the
// swarm.
const DEFAULT_CATEGORY_PROVIDER_OVERRIDES: Record<string, string> = {
  // Example default: test-heavy work runs on the local provider.
  // Unset per-category overrides fall through to `defaultProvider`.
  "1_qa": "paperclip",
};

function parseCategoryProviderOverrides(): Record<string, string> {
  const raw = process.env.CATEGORY_PROVIDER_OVERRIDES;
  if (!raw || raw.trim() === "") {
    return { ...DEFAULT_CATEGORY_PROVIDER_OVERRIDES };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      console.warn(
        "[policy] CATEGORY_PROVIDER_OVERRIDES must be a JSON object; using defaults",
      );
      return { ...DEFAULT_CATEGORY_PROVIDER_OVERRIDES };
    }
    const result: Record<string, string> = {};
    for (const [category, provider] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof provider === "string" && provider.length > 0) {
        result[category] = provider;
      }
    }
    return result;
  } catch (err) {
    console.warn(
      `[policy] Failed to parse CATEGORY_PROVIDER_OVERRIDES: ${String(
        err instanceof Error ? err.message : err,
      )}; using defaults`,
    );
    return { ...DEFAULT_CATEGORY_PROVIDER_OVERRIDES };
  }
}

export const SWARM_POLICY = {
  /** Maximum number of active workers at any time */
  maxActiveWorkers: 96,

  /** Maximum number of active isolation units (worktrees) at any time */
  maxActiveIsolation: 120,

  /** Maximum character length for a task description/instruction payload */
  maxTaskChars: 100_000,

  /** Worker timeout in minutes before watchdog marks stale */
  workerTimeoutMinutes: 30,

  /** Number of days to retain completed task/worker records before cleanup */
  retentionDays: 5,

  /** Maximum number of recent worker records to keep after cleanup */
  maxRetainedWorkerRecords: 100,

  /** Default provider for new workers */
  defaultProvider: "gemini",

  /** Default model for new workers */
  defaultModel: "gemini-3.1-pro",

  /**
   * Pass 17 — per-agent-category provider overrides. The dispatcher /
   * pool-manager resolves a task's provider by consulting this map first
   * (keyed on `agentCategory`) and falling back to `defaultProvider`
   * when no override matches. Operators can override via the
   * `CATEGORY_PROVIDER_OVERRIDES` env var (JSON object).
   */
  categoryProviderOverrides: parseCategoryProviderOverrides(),
};

/**
 * Resolve the provider name for a given agent category. Pass `null` /
 * `undefined` to get the default. Always returns a concrete provider
 * name (never throws) — validation of the provider itself is the
 * factory's responsibility.
 */
export function resolveProviderForCategory(
  category: string | null | undefined,
): string {
  if (category && SWARM_POLICY.categoryProviderOverrides[category]) {
    return SWARM_POLICY.categoryProviderOverrides[category];
  }
  return SWARM_POLICY.defaultProvider;
}
