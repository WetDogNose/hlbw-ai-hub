// Pass 22 — audit-trail helper for SCION admin write actions.
//
// Writes a `MemoryEpisode` row with `kind: "decision"`, stamping the actor's
// email and the action payload into the content for later replay via the
// memory browser. Never throws — audit failures must not break the request
// path (the admin's action already succeeded; losing the audit row is a
// degradation worth a `console.warn`, not an error bubble).

import { getPgvectorMemoryStore } from "@/lib/orchestration/memory/PgvectorMemoryStore";
import type { IapUser } from "@/lib/iap-auth";

export interface AdminAuditPayload {
  [key: string]: unknown;
}

/**
 * Record an admin-triggered state mutation.
 *
 * @param actor - the `IapUser` authorising the action (from `requireAdmin()`).
 * @param action - a dotted verb like `issue.cancel`, `worker.restart`.
 * @param payload - arbitrary JSON; avoid passing secrets (Critic scans for this).
 */
export async function recordAdminAction(
  actor: IapUser,
  action: string,
  payload: AdminAuditPayload,
): Promise<void> {
  try {
    const store = getPgvectorMemoryStore();
    // `taskId` is best-effort: if the payload includes an `issueId`, use it
    // as the task correlation key so the Memory browser can filter by task.
    const taskId =
      typeof payload.issueId === "string" ? (payload.issueId as string) : null;
    await store.write({
      taskId,
      kind: "decision",
      agentCategory: null,
      summary: `${actor.email ?? "unknown"}:${action}`,
      content: {
        action,
        payload,
        actor: actor.email,
        actorRole: actor.role,
      },
    });
  } catch (err) {
    // Never break the request path on audit failure.
    console.warn(
      "[audit] recordAdminAction failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
