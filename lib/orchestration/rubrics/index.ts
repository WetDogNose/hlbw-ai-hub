// Pass 12 — Rubric registry.
//
// Static category → rubric map. No dynamic imports so Next.js / Webpack /
// esbuild keep the bundle graph intact. Call `loadRubric(agentCategory)`
// from the Critic pipeline; unknown or null categories fall through to
// `DEFAULT_RUBRIC`.

import { DEFAULT_RUBRIC } from "./default";
import { QA_RUBRIC } from "./1_qa";
import { SOURCE_CONTROL_RUBRIC } from "./2_source_control";
import { CLOUD_RUBRIC } from "./3_cloud";
import { DB_RUBRIC } from "./4_db";
import { BIZOPS_RUBRIC } from "./5_bizops";
import type { Rubric } from "./types";

export type { Rubric, RubricCheck } from "./types";
export { DEFAULT_RUBRIC } from "./default";
export { QA_RUBRIC } from "./1_qa";
export { SOURCE_CONTROL_RUBRIC } from "./2_source_control";
export { CLOUD_RUBRIC } from "./3_cloud";
export { DB_RUBRIC } from "./4_db";
export { BIZOPS_RUBRIC } from "./5_bizops";

/**
 * Known category names. Kept inline (not re-exported) so downstream code
 * passes plain strings — this is the shape `Issue.agentCategory` already
 * has in `prisma/schema.prisma`.
 */
const REGISTRY: Record<string, Rubric> = {
  [DEFAULT_RUBRIC.name]: DEFAULT_RUBRIC,
  [QA_RUBRIC.name]: QA_RUBRIC,
  [SOURCE_CONTROL_RUBRIC.name]: SOURCE_CONTROL_RUBRIC,
  [CLOUD_RUBRIC.name]: CLOUD_RUBRIC,
  [DB_RUBRIC.name]: DB_RUBRIC,
  [BIZOPS_RUBRIC.name]: BIZOPS_RUBRIC,
};

/**
 * Resolve a rubric by agentCategory. Pure: no I/O, no side effects.
 *
 * - Known category → its rubric.
 * - Unknown category, empty string, `null`, or `undefined` → DEFAULT_RUBRIC.
 */
export function loadRubric(category: string | null | undefined): Rubric {
  if (category === null || category === undefined || category === "") {
    return DEFAULT_RUBRIC;
  }
  return REGISTRY[category] ?? DEFAULT_RUBRIC;
}
