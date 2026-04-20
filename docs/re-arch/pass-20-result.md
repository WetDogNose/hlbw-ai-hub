**ESCALATE required — final deploy gated to user**

# Pass 20 result

## Changed files

- `CLAUDE.md`: full rewrite for the post-re-arch architecture (Postgres source of truth, graph runtime, Actor/Critic/Orchestrator, dynamic context, Turn-PPO seam). Concise (≤200-line target met). Preserves the authoritative agent directives and all Conventions.
- `ARCHITECTURE.md`: new file at repo root. Single-page architectural reference with Mermaid component diagram, 31-row frozen-interfaces table, live invariants, known debt, further reading. ≤300-line target met.
- `package.json`: bumped `"version"` from `0.1.0` → `0.2.0` (major re-arch — warrants minor bump on a 0.x project; semver `MINOR` for non-breaking feature-scale changes, and the app is still pre-1.0).
- `docs/re-arch/tailwind-migration-queue.md`: new standalone queue doc listing the 14 residual Tailwind files + 181 utility-class occurrences, ordered by user-visibility, with per-file execution recipe and acceptance criteria.
- `docs/re-arch/pass-20-result.md`: this file.

## New symbols (with location)

- (none — pass 20 is a cull + docs + version bump; no new code symbols.)

## Deleted symbols

Every deletion was verified with a repository-wide Grep spanning `c:/Users/Jason/repos/{hlbw-ai-hub,wot-box,genkit,adk-python,adk-js}` across the frozen scope `*.ts,*.tsx,*.js,*.mjs,*.cjs,*.py,*.ps1,*.sh,*.cmd,*.bat,*.yaml,*.yml,*.json,*.md,Dockerfile*`.

### Code files — 15 deleted (16 candidates; `docker_exec_proxy.js` was already deleted in pass 10)

| # | Path | Grep command run | Result |
|---|------|------------------|--------|
| 1 | `scripts/swarm/delegate.ts` | `Grep "delegate" in hlbw-ai-hub` | Only self-reference + docs/prose + grammar hit in orchestrator.ts comment + grammar hit in shared-memory.ts string — zero live TS/JS imports. DELETE. |
| 2 | `scripts/swarm/node-a2a-master.ts` | `Grep "node-a2a-master" in all 5 repos` | Only docs (`CLAUDE.md` prose, `pass-02-result.md`, `INVENTORY.md`, `pass-01-critic.md`) + one prose hit in `wot-box/docs/toolchain-prompt/prompt.md`. No code imports, no Dockerfile ref, no script invocation. DELETE. |
| 3 | `scripts/swarm/test-swarm-concurrency.ts` | `Grep "test-swarm-concurrency" in all 5 repos` | Only docs. No live invocation. DELETE. |
| 4 | `scripts/swarm/test-dispatcher.ts` | `Grep "test-dispatcher" in all 5 repos` | Only docs. DELETE. |
| 5 | `scripts/swarm/test-memory-monitor.ts` | `Grep "test-memory-monitor" in all 5 repos` | Only docs. DELETE. |
| 6 | `scripts/swarm/hardware-max-stress.ts` | `Grep "hardware-max-stress" in all 5 repos` | Only docs. DELETE. |
| 7 | `scripts/swarm/start-trace-viewer.ts` | `Grep "start-trace-viewer" in all 5 repos` | Only docs. DELETE. |
| 8 | `scripts/swarm/demo-traces.ts` | `Grep "demo-traces" in all 5 repos` | Only docs. DELETE. |
| 9 | `scripts/swarm/demo-memory-full.ts` | `Grep "demo-memory-full" in all 5 repos` | Only docs. DELETE. |
| 10 | `scripts/swarm/demo-workers.mjs` | `Grep "demo-workers" in all 5 repos` | Only docs. DELETE. |
| 11 | `scripts/swarm/reduce-chunks.ts` | `Grep "reduce-chunks" in all 5 repos` | Docs hit in `docs/v3-swarming-model-architecture.md:159` prose only; zero TS/JS/MJS imports. DELETE. |
| 12 | `scripts/swarm/build-swarm-worker.sh` | `Grep "build-swarm-worker" in all 5 repos` | Only docs. Never wired into `package.json` scripts or `cloudbuild.yaml`. DELETE. |
| 13 | `scripts/swarm/build-python-worker.sh` | `Grep "build-python-worker" in all 5 repos` | Only docs. DELETE. |
| 14 | `lib/orchestration/db-sync.ts` | `Grep "lockIssueForWorkload\|unlockIssue" in all 5 repos` | Only the file's own exports + one legacy prose hit in `docs/dev-state-stage-2.md`. Zero inbound code imports. DELETE. |
| 15 | `scripts/mcp-wrapper.mjs` | `Grep "mcp-wrapper\.mjs\|scripts/mcp-wrapper" in all 5 repos` | Only docs (`docs/features/mcp/mcp-overview.md` cites the wrong extension `scripts/mcp-wrapper.js`); not in `.gemini/mcp.json`, not in any `tools/docker-gemini-cli/configs/*/mcp_config.json`, not in any `Dockerfile` or `cloudbuild.yaml` or `.github/workflows/*.yml`. The `tools/docker-gemini-cli/mcp-wrapper/` directory is a different artifact (wired in `a2a-demo.mjs:9` with absolute path). DELETE. |

### Root-level cruft — 6 deleted

| # | Path | Grep command run | Result |
|---|------|------------------|--------|
| 16 | `build_log.txt` | `Grep "build_log\.txt" in hlbw-ai-hub` | Only `.dockerignore:6` (ignore rule) + docs. Clear disposable log. DELETE. |
| 17 | `log3.txt` | `Grep "log3\.txt" in hlbw-ai-hub` | Only `.dockerignore:10` + docs. Stale log. DELETE. |
| 18 | `logs.txt` | `Grep "logs\.txt" in hlbw-ai-hub` | Only `.dockerignore:9` + docs. Stale log. DELETE. |
| 19 | `logs-cloud-2.txt` | `Grep "logs-cloud-2\.txt" in hlbw-ai-hub` | Only docs. Stale log. DELETE. |
| 20 | `tmp_payload_stress-task-1.json` | `Grep "tmp_payload_stress-task-1" in hlbw-ai-hub` | Only docs. Temp payload artifact. DELETE. |
| 21 | `tmp_payload_test-task-cloud-1234.json` | `Grep "tmp_payload_test-task-cloud" in hlbw-ai-hub` | Only docs. DELETE. |

### KEEPERS — candidates re-verified as live

| Path | Reason for KEEP |
|------|-----------------|
| `scripts/swarm/docker_exec_proxy.js` | Already deleted in pass 10. N/A. |
| `scripts/swarm/shared-memory.ts` | Thin adapter over `MemoryStore`; imported by `agent-runner.ts`, `watchdog.ts`, `runner/nodes.ts`, runner tests + contract tests. Live. (Not a re-arch candidate, listed in spec for re-check.) |
| `.agents/mcp-servers/infrastructure-analyzer/` | Wired in `tools/docker-gemini-cli/configs/category-1-qa/mcp_config.json:12`; verified by `scripts/toolchain-doctor.js:293`. Live. |
| Worker-JSON helpers in `scripts/swarm/state-manager.ts` (`addWorker`, `getWorkerStatus`, `updateWorkerStatus`, `listWorkers`, `getWorkerResult`, `withStateLock`, `saveState`) | `addWorker` + `updateWorkerStatus` are called by `docker-worker.ts`. `withStateLock` + `saveState` are used by the Worker CRUD + snapshot writer. `getWorkerStatus` is called internally by `getWorkerResult`. The public Worker API is frozen in `checkpoint-05.md`. File itself stays; no function pruning without schema + caller change. |
| `scripts/swarm/__tests__/provider-contract.test.ts` | Non-empty contract test suite that imports live symbols (`GeminiAdapter`, `registerProvider`, `getProvider`, `listProviders`) from `providers.ts`. Functional as a manual `npx tsx` smoke test. KEEP. |
| `tmp/` (directory) | Present and empty; `.gitignore`-style scratch dir used at runtime. KEEP. |
| `.venv/` (directory) | User's local Python virtualenv. Removing would break user's local dev env. KEEP (inventory-flagged but risky to touch without user opt-in). |

### Deletion Grep command (frozen from pass 1)

The scope glob used for every candidate above:

```
*.ts,*.tsx,*.js,*.mjs,*.cjs,*.py,*.ps1,*.sh,*.cmd,*.bat,*.yaml,*.yml,*.json,*.md,Dockerfile*
```

across:

```
c:/Users/Jason/repos/hlbw-ai-hub
c:/Users/Jason/repos/wot-box
c:/Users/Jason/repos/genkit
c:/Users/Jason/repos/adk-python
c:/Users/Jason/repos/adk-js
```

Tool used: ripgrep via the harness `Grep` tool.

## New deps

- (none)

## Verifier output

- `npx prisma validate`: PASS ("The schema at prisma\\schema.prisma is valid").
- `npm run test:types`: PASS (exit 0, no output = no TS errors).
- `npm run test:swarm:types`: PASS (exit 0, no output = no TS errors).
- `npm test`: PASS — **20 passed suites, 1 skipped, 141 passed tests, 1 skipped test (pre-existing mock gap in `state.test.ts` from pass 2).** Matches pass 19 baseline of ≥20 suites.
- `npm run lint`: PASS — **0 errors, 69 warnings** (down from 71 at pass 19 baseline; dropped ones came from `delegate.ts` and `demo-*` files that were deleted). Well below the ≤79 ceiling.
- `npm run build`: PASS — Next.js build produced the full route map; no errors.

## Tailwind — 14 residual files (pass 3 carry-forward)

Rewritten this pass: **0**. Per the pass spec's tight-budget clause, I deferred all 14 to the standalone queue.

| Path | Utility-class occurrences |
|------|--------------------------:|
| `app/admin/configuration/client.tsx` | 60 |
| `app/settings/page.tsx` | 27 |
| `app/admin/appearance/page.tsx` | 25 |
| `app/admin/maintenance/client.tsx` | 13 |
| `app/admin/ai/client.tsx` | 11 |
| `components/thread/ChronologyTimeline.tsx` | 9 |
| `components/thread/ApprovalWidget.tsx` | 8 |
| `app/page.tsx` | 7 |
| `app/admin/stats/client.tsx` | 7 |
| `components/thread/LiveExecutionBlock.tsx` | 6 |
| `app/thread/[id]/page.tsx` | 4 |
| `app/docs/layout.tsx` | 2 |
| `app/admin/layout.tsx` | 1 |
| `components/admin-nav.tsx` | 1 (`ml-2` inline with `.badge.badge-danger`) |
| **Total** | **181** |

Patterns seen across the 14: `flex`, `flex-col`, `gap-*`, `grid-cols-*`, `p-*`, `px-*`, `py-*`, `m-*`, `mx-*`, `my-*`, `mt-*`, `mb-*`, `ml-*`, `text-*-*`, `bg-*-*`, `rounded-*`, `border-*`, `shadow-*`, `items-*`, `justify-*`, `space-y-*`, `space-x-*`. The full migration plan is in [docs/re-arch/tailwind-migration-queue.md](./tailwind-migration-queue.md). ARCHITECTURE.md `Known debt` section links to the queue.

## Open issues / deferred

- **14 Tailwind files** — see queue doc; execute separately.
- **Symbol seeder** (`scripts/seed-code-symbols.ts`) — not authored; `PgvectorCodeIndex` starts empty and builder tolerates empty result sets. Post-deploy maintenance pass.
- **Cloud Scheduler** — `deploy/scheduler.yaml` drafted by pass 6; not yet wired into `cloudbuild.yaml`. See pre-deploy checklist below.
- **1 skipped jest test** — `scripts/swarm/__tests__/state.test.ts` (mock gap, carried from pass 2).
- **69 lint warnings** — all `_`-prefixed unused params from interface conformance or catch-clause discards. Cosmetic; does not block anything.

## Cross-repo impact

- None. Dead-code re-greps across `wot-box`, `genkit`, `adk-python`, `adk-js` found only a single prose mention of `node-a2a-master.ts` in `wot-box/docs/toolchain-prompt/prompt.md` (a documentation string, not code). No sibling-repo files were edited.

---

## **ESCALATE required — final deploy**

Pass 20 stops before any deploy action. The final Cloud Build run is the user's gate.

### Exact command

```
gcloud builds submit --config cloudbuild.yaml --project hlbw-ai-hub --region asia-southeast1
```

### Pre-deploy checklist (user runs before the above)

- [ ] Confirm `.env` `DATABASE_URL` is reverted to the production Cloud SQL connector (not the local cloud-sql-proxy URL). Re-arch development used the proxy; prod uses the `/cloudsql/...` Unix socket path.
- [ ] Confirm the cloud-sql-proxy process is terminated locally (`cloud-sql-proxy.x64.exe` sits at repo root).
- [ ] Confirm all Prisma migrations are applied to Cloud SQL prod. Current migrations on disk: `init`, `memory_episode`, `memory_episode-reconcile`, `task_graph_state`, plus any pass-4/7/8 migrations drafted during the re-arch. If prod DB ≠ dev DB, run `npx prisma migrate deploy` against prod first. Do **not** run `prisma migrate dev --accept-data-loss` in prod.
- [ ] Cloud Scheduler wiring decision (per [docs/re-arch/decisions.md](./decisions.md) D4 + pass 6's drafted `deploy/scheduler.yaml`):
  - Option A — deploy now: hand-edit `cloudbuild.yaml` to add a `gcloud scheduler jobs create http` step hitting `POST /api/orchestrator/heartbeat` on a minute cadence, or apply `deploy/scheduler.yaml` out-of-band with `gcloud scheduler jobs create http --schedule=... --uri=... --http-method=POST`. This turns the heartbeat into a live dispatcher.
  - Option B — defer: leave `cloudbuild.yaml` untouched; the heartbeat endpoint exists but nothing calls it on a cadence. Users can curl it manually or re-visit Scheduler in a follow-up deploy.
  - **Dispatcher default (D4): defer.** Draft stays under `deploy/`; no automatic wiring.
- [ ] Confirm you want `APP_VERSION` updated: `cloudbuild.yaml` sets `APP_VERSION=$SHORT_SHA` via Cloud Build substitution, so this will track the commit SHA automatically; the `package.json` `0.2.0` bump does not feed into it.

### Expected outcomes on deploy success

- Container built and pushed to `gcr.io/hlbw-ai-hub/hlbw-ai-hub:latest` and `gcr.io/hlbw-ai-hub/hlbw-ai-hub:$BUILD_ID`.
- Cloud SQL `hlbw-ai-hub-db-instance` patched per the existing `gcloud sql instances patch` step (SSL required, password policy, 03:00 backup, deletion protection).
- Cloud Run service `hlbw-ai-hub` updated in `asia-southeast1` with the new image (`--max-instances 24`, `--memory 1024Mi`, `--port 3000`), Cloud SQL attached via `--add-cloudsql-instances`, env/secrets patched per the existing step.
- Smoke test: `curl -X POST https://hlbw-ai-hub.com/api/orchestrator/heartbeat` should return counts of scanned routines + in-progress issues. If the Scheduler is not wired (Option B above) this stays dormant until invoked.

**The dispatcher will not auto-deploy. No `gcloud builds submit` / `docker push` / Cloud Build command has been executed in this pass.** The user runs the command above when ready.
