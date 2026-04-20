// Pass 18 — Standardized span attribute schema.
//
// A single source of truth for the attribute keys used by every OTEL span
// the orchestrator emits. Consumers (StateGraph transitions, role-level
// spans, provider-level spans, exploration spans) set attributes by these
// constants only — no ad-hoc string keys. This keeps Jaeger/Cloud Trace
// dashboards filterable on a consistent schema.
//
// Attribute-value hygiene: values must be IDs, names, counts, or verdict
// strings. No raw prompt text, no PII, no model output. Token counts are
// numeric; `VERDICT` is one of "PASS" / "REWORK"; `NODE_OUTCOME` is one
// of the `NodeOutcome.kind` literals.

export const SPAN_ATTR = {
  TASK_ID: "hlbw.task.id",
  AGENT_CATEGORY: "hlbw.agent.category",
  ROLE: "hlbw.role", // "actor" | "critic" | "orchestrator" | "watchdog" | "explorer"
  NODE: "hlbw.graph.node",
  NODE_OUTCOME: "hlbw.graph.outcome", // "goto" | "interrupt" | "complete" | "error"
  MODEL_ID: "hlbw.provider.model",
  PROVIDER: "hlbw.provider.name",
  CYCLE: "hlbw.actor_critic.cycle", // integer per rework cycle
  RUBRIC_NAME: "hlbw.rubric.name",
  CONFIDENCE: "hlbw.critic.confidence",
  VERDICT: "hlbw.critic.verdict",
  INPUT_TOKENS: "hlbw.tokens.input",
  OUTPUT_TOKENS: "hlbw.tokens.output",
} as const;

export type SpanAttrKey = (typeof SPAN_ATTR)[keyof typeof SPAN_ATTR];

/** Role values carried on `SPAN_ATTR.ROLE`. Kept as a const union so
 *  the compiler catches typos at call sites. */
export const SPAN_ROLE = {
  ACTOR: "actor",
  CRITIC: "critic",
  ORCHESTRATOR: "orchestrator",
  WATCHDOG: "watchdog",
  EXPLORER: "explorer",
} as const;

export type SpanRole = (typeof SPAN_ROLE)[keyof typeof SPAN_ROLE];
