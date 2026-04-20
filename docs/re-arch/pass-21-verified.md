# Pass 21 verified

**Cycles**: 1. **Verdict**: PASS.

## What's now true
- New `lib/orchestration/introspection.ts` — `getConfigSnapshot`, `getAbilities(category)`, `getWorkflow(issueId)`, `listLiveWorkers`. Server-side only. Never returns secret values; `envSanity` is presence-flags + sensitive marker.
- 5 new GET API routes (all `Cache-Control: no-store`):
  - `/api/scion/config` — providers, overrides, embeddings, env sanity, MCP wiring, rubric registry, hardcoded graph topology.
  - `/api/scion/abilities?category=<x>` — rubric + provider + read-only-flagged tool catalog.
  - `/api/scion/workflow/[id]` — TaskGraphState + history + cycle counts + last critic verdict.
  - `/api/scion/workers` — live container list via `docker ps --format json` shell-out; returns `[]` if docker unreachable.
  - `/api/scion/memory?kind=&cursor=&limit=` — paginated `MemoryEpisode` browser.
- 6 new components (vanilla CSS, semantic classes added to `app/globals.css` under `/* === SCION ops console (added pass 21) === */`): `ConfigPanel`, `WorkflowGraph` (inline SVG, no Mermaid dep), `AbilityMatrix`, `LiveWorkers`, `TraceSidebar`, `MemoryBrowser`.
- `scion-dashboard.tsx` re-laid out as a 4-tab UI: **Operations** (existing panels + LiveWorkers), **Workflow** (issue dropdown + WorkflowGraph + TraceSidebar), **Abilities** (AbilityMatrix + ConfigPanel), **Memory** (MemoryBrowser).
- Test gate: `prisma validate`, `test:types`, `test:swarm:types`, `npm test` (25 suites + 6 new = 31 total; 1 pre-existing actor-critic timeout flake under parallel workers, verified against pass-20 baseline), `lint` (0 errors / 68 warnings — down 1 from pass-20), `npm run build` with all 5 new routes registered — all PASS.
- Zero Tailwind leaks in new components.
- No new deps; no schema changes; no migrations.

## Frozen this pass
- Introspection contract: never expose env values, only presence + sensitivity flag.
- Graph topology is a HARDCODED 7-node sequence in `getConfigSnapshot`. Adding/removing a node requires updating both `nodes.ts` and `getConfigSnapshot.graphTopology` together.
- Tab layout: 4 tabs is the new shape; adding a 5th means extending the tab-state enum + adding a section.

## Open carry-forward
- Pre-existing `actor-critic.test.ts` 5s timeout under parallel jest workers. Symptom matches pass-20 baseline; not regressed by pass-21. Needs a follow-up to either bump the test timeout or serialize the suite.
- 13 Tailwind files outside SCION scope, scheduler wiring, symbol seeder script, lint warnings, password rotation, `.env` to `.dockerignore` — unchanged.
