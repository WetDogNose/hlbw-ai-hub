// Pass 22 — container-name validation for SCION worker actions.
//
// The `/api/scion/workers/[name]/*` and `/api/scion/pool/*` routes shell out
// to `docker` with the container name from the URL. Validating the name
// against a strict pattern prevents command injection (the `docker` CLI
// itself is argv-safe via `spawn`, but we reject anything outside the
// known hlbw-* conventions defensively).
//
// Accepted prefixes reflect the containers actually operated by the hub:
//   - hlbw-worker-warm-<cat>-<n>  — pool workers
//   - hlbw-worker-<anything>      — ad-hoc swarm workers
//   - hlbw-hub-<anything>         — the Next.js server itself
//   - hlbw-paperclip              — paperclip proxy
//   - hlbw-cloudsql-proxy         — SQL proxy
//   - hlbw-jaeger                 — observability
//   - hlbw-neo4j                  — legacy memory read path
//   - hlbw-memory-monitor         — fragment monitor
//
// Match-all regex is deliberately anchored; no embedded whitespace, shell
// metacharacters, slashes, or path traversal components pass.

export const CONTAINER_NAME_PATTERN =
  /^hlbw-(?:worker-warm-|worker-|hub-|paperclip|cloudsql-proxy|jaeger|neo4j|memory-monitor)[A-Za-z0-9_.-]*$/;

export function isValidContainerName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  if (name.length === 0 || name.length > 128) return false;
  return CONTAINER_NAME_PATTERN.test(name);
}
