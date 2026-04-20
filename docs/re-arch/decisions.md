# Re-arch decisions (dispatcher's defaults)

User authorized YOLO TURBO-ALL execution on 2026-04-19. Below are the dispatcher's default answers to the 5 open questions in PLAN.md §4. Any of these can be countermanded by the user mid-run; the dispatcher will re-plan.

## D1. Memory store (pass 7)
**Decision: Postgres + pgvector.** Single DB to operate, already provisioned on Cloud SQL, survives Cloud Run cold start, queryable from SCION UI without a second driver. Neo4j retained only as a deprecated read-adapter for any historical traversal queries — verifier in pass 7 confirms no live writers to Neo4j remain.

## D2. Turn-PPO seam (pass 19)
**Decision: build the seam, no training code.** Adds the `lib/rl/turn-critic.ts` interface + no-op recorder + `turn_advantage` table. Lets future RL work plug in without re-architecture. Marginal cost; high optionality.

## D3. Style bankruptcy (pass 3)
**Decision: vanilla CSS wins.** Confirms the existing `.cursorrules`/`.geminirules` policy. Tailwind utility classes ripped from `components/scion-dashboard.tsx` and `components/orchestration/*.tsx`; new semantic classes added to `app/globals.css`.

## D4. Cloud Scheduler for heartbeat (pass 6)
**Decision: draft the YAML, do NOT deploy.** Pass 6 will add the Cloud Scheduler config to `cloudbuild.yaml` but commented-out / behind a `--include-scheduler` flag. The single deploy in pass 20 surfaces the toggle to the user.

## D5. Migration approval flow (passes 4, 7, 8)
**Decision: draft `.sql`, surface for approval, do not run.** Each pass that touches `prisma/schema.prisma` writes the `prisma/migrations/<ts>_<name>/migration.sql` and pauses. Dispatcher posts a ready-to-run command (`npx prisma migrate dev --name <name>`) for the user to execute. No `--accept-data-loss`, ever. Subsequent code changes that depend on the migration are gated until the user confirms.

## Anti-hallucination posture
The dispatcher (this conversation) treats sub-agent claims as untrusted until verified by:
1. The Critic sub-agent's PASS verdict.
2. The dispatcher's own Grep of cited new symbols.
3. The standard test gate (`test:types`, `test:swarm:types`, `test`, `lint`).

If any of these fail, the pass is REWORK (max 3 cycles) or ESCALATE.
