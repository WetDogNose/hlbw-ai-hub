# Pass 10 verified

**Cycles**: 1. **Verdict**: PASS. **Checkpoint-10 written** — see `checkpoint-10.md`.

## What's now true
- `scripts/swarm/docker-worker.ts` rewired: no HTTP POST, no `docker_exec_proxy.js`. Spawns the one-shot graph driver via the MCP `run_container` call (already parameterized in `pool-manager.ts:95`).
- `scripts/swarm/watchdog.ts` rewritten: scans stale `task_graph_state` rows and calls `StateGraph.interrupt(issueId, "watchdog_timeout")` — never deletes worker state. Parent Issue flipped back to `pending` for dispatcher pickup. Optional `docker kill` via `child_process.spawn`.
- New `scripts/swarm/resume-worker.ts` CLI: loads existing graph row, calls `StateGraph.resume`, spawns container with `AGENT_ISSUE_ID`. `agent-runner.ts` `main()` now checks `StateGraph.get(issueId)` and skips `start()` when the row already exists — the transition loop runs either way.
- `scripts/swarm/pool-manager.ts` prefers paused/interrupted task resumption over pulling a new pending one.
- `RunnerContext.worker` field added in `nodes.ts`; runner writes `{ provider, modelId, containerId, startedAt }` there. JSON worker tracking demoted to advisory.
- `docker_exec_proxy.js` deleted — zero code refs across all 5 repos (sibling + this one). Only historical doc-prose hits.
- Test gate: `prisma validate`, `test:types`, `test:swarm:types`, `npm test` (4 suites / 32 passed + 1 skipped), `lint` (0 errors / 59 warnings — down from 68), `watchdog.test.ts` 3/3, `nodes.test.ts` 14/14, `npm run build` PASS.

## Frozen this pass (in addition to checkpoint-10.md)
- Dispatch loop topology: `pool-manager` → `docker-worker` → container CMD `["npx","tsx","/workspace/scripts/swarm/agent-runner.ts"]` → graph driver loops `transition()` → watchdog interrupts on timeout → `resume-worker.ts` restarts. No HTTP A2A anywhere.
- Watchdog interrupts; it never destroys state. Resume picks up from the last persisted node.

## Open carry-forward
- 13 extra Tailwind files, scheduler wiring, 59 swarm lint warnings, dead-code cull — unchanged.
- Worker-persistence JSON demoted but not yet deleted; pass 20 cull.
