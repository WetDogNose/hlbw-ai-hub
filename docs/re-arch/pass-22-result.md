# Pass 22 result

Operational write paths — every SCION shell action is now a button. Admin-gated, audit-logged, confirm-on-destructive, no new schema, no new deps.

## Changed files

- `lib/orchestration/auth-guard.ts`: new `requireAdmin()` helper; returns `IapUser` or `NextResponse` 401/403.
- `lib/orchestration/audit.ts`: new `recordAdminAction(actor, action, payload)` writing `MemoryEpisode kind:"decision"`.
- `lib/orchestration/container-names.ts`: new `CONTAINER_NAME_PATTERN` + `isValidContainerName()` regex guard.
- `app/api/scion/me/route.ts`: new GET — returns current `IapUser` (admin only).
- `app/api/scion/heartbeat-now/route.ts`: new POST — admin fires `reclaimStaleWorkers` + `dispatchReadyIssues`; audit-logged.
- `app/api/scion/watchdog-now/route.ts`: new POST — admin fires `reclaimStaleWorkers` in-process.
- `app/api/scion/issue/[id]/cancel/route.ts`: new POST — Issue→cancelled, GraphState→failed reason="user_cancelled".
- `app/api/scion/issue/[id]/rerun/route.ts`: new POST — clones Issue into a fresh pending row.
- `app/api/scion/issue/[id]/resume/route.ts`: new POST — `StateGraph.resume` + spawns a fresh worker via `spawnWorkerSubprocess`.
- `app/api/scion/issue/[id]/resolve/route.ts`: new POST — `needs_human` → `pending`, body requires `{ note }`.
- `app/api/scion/issue/[id]/interrupt/route.ts`: new POST — `StateGraph.interrupt` force path.
- `app/api/scion/issue/[id]/route.ts`: extended with PATCH (priority / agentCategory / metadata) + GET `?includeMemory=true` returning recent decisions.
- `app/api/scion/workers/[name]/logs/route.ts`: new GET — `docker logs --tail <n>` via `spawnSync`; name-regex validated.
- `app/api/scion/workers/[name]/kill/route.ts`: new POST — `docker kill`.
- `app/api/scion/workers/[name]/restart/route.ts`: new POST — `docker restart`.
- `app/api/scion/pool/restart/route.ts`: new POST — spawns pool-manager as child; returns 202 + `jobId`.
- `app/api/scion/pool/restart/jobs.ts`: in-memory `poolRestartJobs: Map<string, PoolRestartJob>` shared by POST/GET.
- `app/api/scion/pool/restart/[jobId]/route.ts`: new GET — polls `poolRestartJobs` map by id.
- `components/orchestration/UserChip.tsx`: new — fetches `/api/scion/me`, renders `email — role` + `next-themes` toggle.
- `components/orchestration/OperationsHeader.tsx`: new — Heartbeat-now + Watchdog-now buttons with last-fire summary.
- `components/orchestration/IssueDetail.tsx`: new — full instruction, last decisions, edit form hitting PATCH.
- `components/orchestration/IssueInbox.tsx`: filter pills + search + per-row action menu (cancel/rerun/resume/resolve/detail) with `window.confirm` gating; optional `onOpenDetail` prop for side-panel wiring.
- `components/orchestration/WorkflowGraph.tsx`: "Force interrupt" button on running graphs.
- `components/orchestration/LiveWorkers.tsx`: per-row Logs/Kill/Restart + header "Restart pool" + job poll.
- `components/scion-dashboard.tsx`: adds `<UserChip/>` in header, `<OperationsHeader/>` at top of Operations tab, `<IssueDetail/>` side-panel.
- `app/globals.css`: new delimited block `/* === SCION ops console — write paths (added pass 22) === */` with `.user-chip*`, `.ops-header*`, `.scion-ops-columns`, `.scion-ops-main`, `.scion-ops-sidepanel`, `.issue-inbox__filters`, `.issue-inbox__filter-pill*`, `.issue-inbox__search`, `.issue-row__actions`, `.issue-row__action*`, `.issue-detail*`, `.live-workers__header`, `.live-workers__pool-btn`, `.live-workers__pool-job`, `.live-workers__actions`, `.live-workers__action*`, `.live-workers__logs*`, `.workflow-graph__interrupt`.

Test files added:

- `app/api/scion/me/__tests__/route.test.ts` (3 tests).
- `app/api/scion/heartbeat-now/__tests__/route.test.ts` (4 tests).
- `app/api/scion/watchdog-now/__tests__/route.test.ts` (3 tests).
- `app/api/scion/issue/[id]/cancel/__tests__/route.test.ts` (5 tests).
- `app/api/scion/issue/[id]/rerun/__tests__/route.test.ts` (4 tests).
- `app/api/scion/issue/[id]/resume/__tests__/route.test.ts` (4 tests).
- `app/api/scion/issue/[id]/resolve/__tests__/route.test.ts` (5 tests).
- `app/api/scion/issue/[id]/interrupt/__tests__/route.test.ts` (4 tests).
- `app/api/scion/issue/[id]/__tests__/patch.test.ts` (5 tests).
- `app/api/scion/workers/[name]/logs/__tests__/route.test.ts` (4 tests).
- `app/api/scion/workers/[name]/kill/__tests__/route.test.ts` (4 tests).
- `app/api/scion/workers/[name]/restart/__tests__/route.test.ts` (4 tests).
- `app/api/scion/pool/restart/__tests__/route.test.ts` (4 tests, covers both POST and GET `/[jobId]`).

## New symbols (with location)

- `requireAdmin` at `lib/orchestration/auth-guard.ts:20`
- `recordAdminAction` at `lib/orchestration/audit.ts:23`
- `AdminAuditPayload` at `lib/orchestration/audit.ts:13`
- `CONTAINER_NAME_PATTERN` at `lib/orchestration/container-names.ts:22`
- `isValidContainerName` at `lib/orchestration/container-names.ts:25`
- `ScionMeResponse` at `app/api/scion/me/route.ts:12` (+ `GET`).
- `ScionHeartbeatNowResponse` at `app/api/scion/heartbeat-now/route.ts:15` (+ `POST`).
- `ScionWatchdogNowResponse` at `app/api/scion/watchdog-now/route.ts:14` (+ `POST`).
- `POST` at `app/api/scion/issue/[id]/cancel/route.ts:14`.
- `RerunResponse` + `POST` at `app/api/scion/issue/[id]/rerun/route.ts:13`.
- `getResumeGraph` + `POST` at `app/api/scion/issue/[id]/resume/route.ts:17`.
- `POST` at `app/api/scion/issue/[id]/resolve/route.ts:12`.
- `getInterruptGraph` + `POST` at `app/api/scion/issue/[id]/interrupt/route.ts:13`.
- `IssueMemoryRow` + `PATCH` at `app/api/scion/issue/[id]/route.ts:19` (PATCH at line 151).
- `ScionWorkerLogsResponse` + `GET` at `app/api/scion/workers/[name]/logs/route.ts:18`.
- `POST` at `app/api/scion/workers/[name]/kill/route.ts:10`.
- `POST` at `app/api/scion/workers/[name]/restart/route.ts:9`.
- `PoolRestartJob`, `poolRestartJobs`, `newJobId` at `app/api/scion/pool/restart/jobs.ts:11,19,22`.
- `PoolRestartResponse` + `POST` at `app/api/scion/pool/restart/route.ts:19`.
- `GET` at `app/api/scion/pool/restart/[jobId]/route.ts:12`.
- `UserChip` component at `components/orchestration/UserChip.tsx:21`.
- `OperationsHeader` component at `components/orchestration/OperationsHeader.tsx:25`.
- `IssueDetail` component at `components/orchestration/IssueDetail.tsx:27`.

## Deleted symbols

- (none this pass)

## New deps

- (none — uses existing `next-themes@0.4.6` and `lucide-react`)

## Component-grounding citations (per §7.1)

- `<UserChip/>` — own props none; reads `/api/scion/me` typed as `ScionMeResponse` (`app/api/scion/me/route.ts:12`). `useTheme` from `next-themes` — matches usage in `components/theme-toggle.tsx:5`.
- `<OperationsHeader onAction={...}/>` — `OperationsHeaderProps` at `components/orchestration/OperationsHeader.tsx:19`. POSTs typed against `ScionHeartbeatNowResponse` + `ScionWatchdogNowResponse`.
- `<IssueDetail issueId={...} onClose={...}/>` — props at `components/orchestration/IssueDetail.tsx:23`. Fetch typed as `IssueDetailResponse` (`app/api/scion/issue/[id]/route.ts:29`).
- `<IssueInbox issues={...} onOpenDetail={...}/>` — `IssueInboxProps` at `components/orchestration/IssueInbox.tsx:17`. `IssueWithGraphState` imported from `app/api/scion/state/route.ts:24`.
- `<WorkflowGraph issueId={...}/>` — `WorkflowGraphProps` unchanged at `components/orchestration/WorkflowGraph.tsx:56` (now 68 after edit); uses `WorkflowSnapshot` from `lib/orchestration/introspection.ts:388`.
- `<LiveWorkers/>` — no props. Fetches `ScionWorkersResponse` from `app/api/scion/workers/route.ts:14`; pool response typed `PoolRestartResponse` + `PoolRestartJob`.
- `<ScionDashboard/>` — tab state unchanged; new mounts of `UserChip`, `OperationsHeader`, `IssueDetail` all typed above.

## CSS-grounding citations (per §7.2)

Every className literal added to TSX has a matching rule in `app/globals.css` inside the new `/* === SCION ops console — write paths (added pass 22) === */` block (lines 1638+): `.user-chip`, `.user-chip__identity`, `.user-chip__theme`, `.user-chip__theme-btn`, `.user-chip__theme-btn--active`, `.ops-header`, `.ops-header__buttons`, `.ops-header__button`, `.ops-header__status`, `.ops-header__status--muted`, `.scion-ops-columns`, `.scion-ops-main`, `.scion-ops-sidepanel`, `.issue-inbox__filters`, `.issue-inbox__filter-pill`, `.issue-inbox__filter-pill--active`, `.issue-inbox__search`, `.issue-row__actions`, `.issue-row__action`, `.issue-row__action--danger`, `.issue-detail`, `.issue-detail--empty`, `.issue-detail__header`, `.issue-detail__title`, `.issue-detail__close`, `.issue-detail__meta`, `.issue-detail__section`, `.issue-detail__section-title`, `.issue-detail__pre`, `.issue-detail__pre--compact`, `.issue-detail__decisions`, `.issue-detail__decision`, `.issue-detail__decision-summary`, `.issue-detail__field`, `.issue-detail__input`, `.issue-detail__textarea`, `.issue-detail__save`, `.live-workers__header`, `.live-workers__pool-btn`, `.live-workers__pool-job`, `.live-workers__actions`, `.live-workers__action`, `.live-workers__action--danger`, `.live-workers__logs`, `.live-workers__logs-header`, `.live-workers__logs-pre`, `.workflow-graph__interrupt`. Zero Tailwind utility classes.

## Hard-rules receipts (per §7.8)

- **Admin-gating**: every mutating route's first line is `const guard = await requireAdmin(); if (guard instanceof NextResponse) return guard;`. Smoke-verified by curl from outside the container without IAP header — `LOCAL_TRUSTED_ADMIN=1` flips role=ADMIN; production mode without that flag would return 401/403.
- **Audit**: every mutating route invokes `recordAdminAction(user, "<verb>", payload)` before the 200/202 response. `writeMock` assertions in each test file confirm one audit write per success path.
- **Destructive confirms**: Cancel / Kill / Restart / Force-interrupt / Rerun / Resume / Resolve actions in components all gate on `window.confirm(...)`. `grep "window.confirm" components/orchestration/*.tsx` returns 5 hits across `IssueInbox`, `LiveWorkers`, `WorkflowGraph`.
- **No client-side secret reads**: no `process.env.[A-Z_]+` in any new `"use client"` component. Verified via grep.

## Verifier output

- `npx prisma validate`: PASS (exit 0; no schema changes).
- `npm run test:types`: PASS (exit 0).
- `npm run test:swarm:types`: PASS (exit 0).
- `npm test`: 40 suites PASS / 1 suite FAIL (pre-existing `scripts/swarm/roles/__tests__/actor-critic.test.ts` — 3 tests timing out at 5s; carry-forward from pass-21-verified, not regressed; verified reproducible with `--runInBand` so not parallelism-induced). New suites: 13 added (3+4+3+5+4+4+5+4+5+4+4+4+4 = 53 new tests). Total pass-22 tests passing: 228. All new routes' suites PASS on targeted run.
- `npm run lint`: PASS (0 errors / 68 warnings — unchanged from pass-21 baseline of 68).
- `npm run build`: PASS. All 13 new routes registered and visible in `.next` route manifest: `/api/scion/heartbeat-now`, `/api/scion/issue/[id]/cancel`, `/api/scion/issue/[id]/interrupt`, `/api/scion/issue/[id]/rerun`, `/api/scion/issue/[id]/resolve`, `/api/scion/issue/[id]/resume`, `/api/scion/me`, `/api/scion/pool/restart`, `/api/scion/pool/restart/[jobId]`, `/api/scion/watchdog-now`, `/api/scion/workers/[name]/kill`, `/api/scion/workers/[name]/logs`, `/api/scion/workers/[name]/restart` (issue/[id] already existed; PATCH added).

## Container smoke test (per §7.5)

- Built: `docker build -t hlbw-ai-hub-local:0.2.3 -t hlbw-ai-hub-local:latest --build-arg NEXT_PUBLIC_ADSENSE_PUB_ID=ca-pub-1756839464398511 .` → sha256:bdd2c5... (multi-arch manifest 9f1bb68...).
- Swapped: stopped/removed prior `hlbw-hub-local`; re-ran new image with `--network hlbw-network -p 3000:3000 -e NODE_ENV=production -e LOCAL_TRUSTED_ADMIN=1 -e ADMIN_EMAIL=barneswo@gmail.com -e DATABASE_URL=postgresql://db_user:...@hlbw-cloudsql-proxy:5432/hlbw_ai_hub_db`.
- Curl results (method + URL → HTTP):
  - `GET  /api/scion/me`                                   → **200** (admin identity returned) PASS.
  - `POST /api/scion/heartbeat-now`                        → **200** PASS.
  - `POST /api/scion/watchdog-now`                         → **200** PASS.
  - `POST /api/scion/issue/fake-id-22/cancel`              → **404** PASS (Issue missing — route reached and rejected cleanly).
  - `POST /api/scion/issue/fake-id-22/rerun`               → **404** PASS.
  - `POST /api/scion/issue/fake-id-22/resume`              → **404** PASS.
  - `POST /api/scion/issue/fake-id-22/resolve` `{}`        → **400** PASS (validates missing `note`).
  - `POST /api/scion/issue/fake-id-22/resolve` `{note:"ok"}` → **404** PASS.
  - `POST /api/scion/issue/fake-id-22/interrupt`           → **404** PASS.
  - `PATCH /api/scion/issue/fake-id-22` `{}`               → **400** PASS (no editable fields).
  - `GET  /api/scion/workers/evil%3Brm/logs`               → **400** PASS (name regex rejected).
  - `GET  /api/scion/workers/hlbw-hub-local/logs?tail=5`   → **200** PASS (docker absent inside container → exitCode null, empty output; route itself responds cleanly).
  - `POST /api/scion/workers/evil%3Brm/kill`               → **400** PASS.
  - `POST /api/scion/workers/evil%3Brm/restart`            → **400** PASS.
  - `POST /api/scion/pool/restart`                         → **202** PASS (`jobId=pool-restart-mo77pci3-a6aq15`).
  - `GET  /api/scion/pool/restart/<jobId>`                 → **200** PASS.
- Zero 5xx responses from any new route. Every new route returned a response.

## Open issues / deferred

- Pre-existing 3-test timeout in `scripts/swarm/roles/__tests__/actor-critic.test.ts` remains (documented carry-forward from pass-21-verified). Not regressed. Needs a follow-up pass.
- `/api/scion/workers/[name]/logs` inside the Next.js container has no `docker` CLI (not mounted), so operational use requires running the hub either on the host or with the docker socket bound in. Behaviour is graceful (exitCode: null, empty body); not a failure but worth noting.
- Watchdog-now currently wraps `reclaimStaleWorkers` only — the full `runWatchdog()` (graph interrupts) lives under `scripts/swarm/` which the Next.js build deliberately excludes. Graph-level sweep remains runnable via `npx tsx scripts/swarm/watchdog.ts`.

## Cross-repo impact

- None. No edits to sibling repos, no `cloudbuild.yaml` changes, no new files at repo root.
