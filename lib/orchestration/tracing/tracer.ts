// Pass 18 — Shared OTEL tracer factory for the orchestrator layer.
//
// `lib/` cannot import from `scripts/swarm/tracing.ts` (the one-way
// dependency direction from checkpoint-15: `lib/` never imports `scripts/`).
// The scripts-side `getTracer` keeps its existing signature; both call
// through to `@opentelemetry/api`'s global `trace.getTracer` and therefore
// share the same tracer provider in-process. The SDK bootstrap
// (`startTracing` in `scripts/swarm/tracing.ts` and `lib/otel.ts`'s tracer
// handle) registers the provider before any of these are called.

import { trace, type Tracer } from "@opentelemetry/api";

/**
 * Return a named OTEL tracer for orchestrator spans. Defaults to
 * `"hlbw-orchestrator"` so graph transitions, roles, and exploration
 * steps all surface under one service in Jaeger/Cloud Trace unless a
 * caller explicitly supplies a sub-name.
 */
export function getOrchestratorTracer(
  name: string = "hlbw-orchestrator",
): Tracer {
  return trace.getTracer(name);
}
