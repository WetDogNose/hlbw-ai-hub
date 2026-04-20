# Pass 10 result

## Changed files
- `scripts/swarm/docker-worker.ts`: replaced HTTP POST to `localhost:8000/a2a` with `docker exec <warmContainer> npx tsx /workspace/scripts/swarm/agent-runner.ts` carrying `AGENT_ISSUE_ID`/`AGENT_CATEGORY`/`AGENT_INSTRUCTION`/`WORKTREE_PATH` as env vars. Worker state/task status updates on exit code.
- `scripts/swarm/watchdog.ts`: full rewrite. Watchdog now scans `task_graph_state` for `status='running'` rows with `lastTransitionAt < now() - SWARM_POLICY.workerTimeoutMinutes * 60s`, calls `StateGraph.interrupt(issueId, 'watchdog_timeout ...')`, flips the parent `Issue.status` to `pending`, best-effort `docker kill`s any matching container, and audits each intervention.
- `scripts/swarm/resume-worker.ts`: new CLI + exported `resumeIssue(issueId, { spawn })` function. Loads the row, calls `StateGraph.resume()`, syncs `Issue.status` to `in_progress`, spawns the one-shot agent-runner via `docker exec`.
- `scripts/swarm/agent-runner.ts`: `main()` now calls `graph.get(issueId)` first; if a row exists, skips `graph.start()` (resume path) and enters the transition loop directly. When starting fresh, writes `context.worker = { provider, modelId, containerId, startedAt }`.
- `scripts/swarm/runner/nodes.ts`: added `RunnerWorker` interface and optional `worker?: RunnerWorker` field on `RunnerContext`. `asRunnerContext` now preserves it.
- `scripts/swarm/pool-manager.ts`: added `pickNextResumable()` helper (queries `task_graph_state` for paused/interrupted rows ordered by `lastTransitionAt asc`, calls `resumeIssue` if one exists). New `resume-next` CLI subcommand.
- `scripts/swarm/__tests__/watchdog.test.ts`: new. 3 tests covering stale-only interruption, all-fresh no-op, and empty-fixture no-op.
- `scripts/swarm/__tests__/resume-worker.integration.test.ts`: new. `DB_TEST=1`-gated integration test that seeds an Issue + paused `task_graph_state` row, calls `resumeIssue(..., { spawn: false })`, asserts row flips to `running` and Issue flips to `in_progress`.

## New symbols (with location)
- `WATCHDOG_TIMEOUT_REASON` (string const) at `scripts/swarm/watchdog.ts:22`
- `WatchdogInterruption` interface at `scripts/swarm/watchdog.ts:81`
- `runWatchdog()` (rewritten, returns `Promise<WatchdogInterruption[]>`) at `scripts/swarm/watchdog.ts:94`
- `resumeIssue(issueId, opts)` at `scripts/swarm/resume-worker.ts:28`
- `ResumeResult` interface at `scripts/swarm/resume-worker.ts:18`
- `pickNextResumable()` at `scripts/swarm/pool-manager.ts:123`
- `resolveWarmHost(taskId, agentCategory)` (private helper) at `scripts/swarm/docker-worker.ts:46`
- `RunnerWorker` interface at `scripts/swarm/runner/nodes.ts:55`
- `worker?: RunnerWorker` field on `RunnerContext` at `scripts/swarm/runner/nodes.ts:73`

## Deleted symbols
- `scripts/swarm/docker_exec_proxy.js` (entire file) — verified zero inbound refs via repo-wide Grep under scope `*.{ts,tsx,js,mjs,cjs,py,ps1,sh,cmd,bat,yaml,yml,json,md}` plus `Dockerfile*` and `.agents/**` across all five repos (`hlbw-ai-hub`, `wot-box`, `genkit`, `adk-python`, `adk-js`). Only prose hits in `docs/re-arch/*` and `INVENTORY.md`/`CLAUDE.md`; no code callers. Pass-01 inventory had already flagged it as dead-code; pass-09 verified the old HTTP path was the sole live caller. That path was removed in 10.1, making the file unreachable.

## New deps
- None.

## Verifier output
- `npx prisma validate`: PASS (schema valid, no changes).
- `npm run test:types`: PASS.
- `npm run test:swarm:types`: PASS.
- `npm test`: PASS (4 suites / 32 tests + 1 skipped — matches pass-8 baseline).
- `npm run lint`: PASS (0 errors, 59 warnings — down from 60 after removing unused import; under the 79 baseline).
- `npx jest scripts/swarm/__tests__/watchdog.test.ts` (via `--config jest.config.ts --roots <rootDir>/scripts/swarm/__tests__/ --testRegex 'watchdog\.test\.ts$'`): PASS (3/3).
- `npx jest scripts/swarm/runner/__tests__/nodes.test.ts` (via similar flags): PASS (14/14 — unchanged count; 10.6 added an optional field without adding tests).
- `npm run build`: PASS (Compiled successfully in 3.3s, 25/25 static pages generated).

## Open issues / deferred
- 13 extra Tailwind-using files (pass 3) still awaiting user scope decision.
- `provider-contract.test.ts` still broken (empty jest suite) — scheduled for pass 20 cull.
- 59 swarm lint warnings remain; scheduled for pass 20 cull.
- `resume-worker.integration.test.ts` requires `DB_TEST=1` and a live Postgres; not wired into CI.
- Scheduler wiring for watchdog/resume-next cadence deferred to pass 20 (cloudbuild frozen until then).
- Dockerfile CMD unchanged: `scripts/swarm/Dockerfile.swarm-worker` has no hardcoded CMD (line 15 comment: "Command is overridden by MCP run_container tool"). Pool-manager already passes `["npx", "tsx", "/workspace/scripts/swarm/agent-runner.ts"]` via the MCP `run_container` call, so no Dockerfile edit was needed to complete 10.1's resolution (a).

## Cross-repo impact
- None. Grep across `wot-box`, `genkit`, `adk-python`, `adk-js` for `docker_exec_proxy` and `agent-runner` returned zero code-level hits.
