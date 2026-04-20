# Pass 20 verified — RE-ARCH COMPLETE (pending final deploy)

**Cycles**: 1. **Verdict**: ESCALATE (final deploy gate per plan §2.2 rule 11).

## What's now true
- **21 dead files deleted**: 15 under `scripts/swarm/` + `lib/` (delegate, node-a2a-master, test-swarm-concurrency, test-dispatcher, test-memory-monitor, hardware-max-stress, start-trace-viewer, demo-traces, demo-memory-full, demo-workers.mjs, reduce-chunks, build-{swarm,python}-worker.sh, db-sync, mcp-wrapper.mjs) + 6 root-cruft (build_log.txt, log3.txt, logs.txt, logs-cloud-2.txt, tmp_payload_*.json ×2). Each deletion backed by frozen-scope Grep across all 5 workspace repos.
- **ARCHITECTURE.md** at repo root (176 lines): Mermaid diagram + frozen interfaces table (22 entries) + live invariants + known debt + further reading. Single-page reference.
- **CLAUDE.md** rewritten (134 lines): Postgres-as-SoT, one-shot CLI dispatch, Actor/Critic/Orchestrator split, graph topology, rubric registry, dynamic context builder, memory/embeddings/code-index, OTEL attrs, Turn-PPO seam, SCION UI surface.
- **`package.json` version**: `0.1.0` → `0.2.0`.
- **13 Tailwind files deferred** to `docs/re-arch/tailwind-migration-queue.md` — a standalone follow-up plan. None rewritten in pass 20.
- Test gate: `prisma validate`, `test:types`, `test:swarm:types`, `npm test` (20 suites / 141 tests + 1 skipped), `lint` (0 errors / 69 warnings — down from 71), `npm run build` — all PASS.
- `cloudbuild.yaml` untouched. Zero deploy commands executed.

## Final frozen state (the whole re-arch)
All 3 checkpoints (`checkpoint-05.md`, `checkpoint-10.md`, `checkpoint-15.md`) + `ARCHITECTURE.md` + `CLAUDE.md` constitute the complete frozen reference. Future changes should extend these, not replace them.

## USER ACTION REQUIRED — final deploy gate
Before deploying, from `c:/Users/Jason/repos/hlbw-ai-hub/`:

### Pre-deploy checklist
- [ ] Revert `.env` `DATABASE_URL` from the `127.0.0.1:5433` proxy override back to the production Cloud Run connector form.
- [ ] Terminate the `cloud-sql-proxy` process.
- [ ] If the production Cloud SQL DB is a different instance from the dev one you just migrated (it may be, check Cloud SQL console), run `npx prisma migrate deploy` against it with the prod URL. The four migrations (`20260420011457_init`, `20260420032326_memory_episode`, `20260420034437_memory_episode` reconcile, `20260420034813_task_graph_state`) must all apply.
- [ ] Decide Cloud Scheduler wiring: deploy now via manual `gcloud scheduler jobs create` using `deploy/scheduler.yaml`, or defer.
- [ ] Rotate the DB password from earlier in the session if it was your real one.

### Deploy command
```powershell
gcloud builds submit --config cloudbuild.yaml --project hlbw-ai-hub --region asia-southeast1
```

Expected outcomes: container built + pushed to GCR (`gcr.io/hlbw-ai-hub/hlbw-ai-hub:$BUILD_ID`), Cloud Run `hlbw-ai-hub` service updated in `asia-southeast1`, DB settings patched per existing `cloudbuild.yaml`.

Paste the output (or any error) when done. After deploy succeeds, the re-architecture is landed.

## Open carry-forward (post-re-arch)
- 13 Tailwind files → `docs/re-arch/tailwind-migration-queue.md`.
- Symbol seeder script for `PgvectorCodeIndex` (index currently empty; builder handles gracefully).
- Cloud Scheduler wiring decision.
- 69 swarm-lint warnings (unused-vars; cosmetic).
- 1 skipped test (`state.test.ts` `proper-lockfile` mock gap — pre-existing, non-blocking).
