# Pass 09 verified

**Cycles**: 1. **Verdict**: PASS.

## What's now true
- `scripts/swarm/agent-runner.ts` is a thin graph driver: reads `AGENT_ISSUE_ID`, calls `defineAgentGraph().start()`, loops `transition()` until a non-goto outcome, emits OTEL spans per node.
- New `scripts/swarm/runner/nodes.ts` defines 7 nodes: `init_mcp` → `build_context` → `propose_plan` → `execute_step` ⇄ `record_observation` ⇄ `evaluate_completion` → `commit_or_loop`. Existing logic (MCP boot, tool-dump context, shared-memory writes, Gemini chat loop) redistributed into the nodes without semantic change.
- `RunnerContext` typed: `{ taskId, agentCategory, modelId, mcpTools?, systemPrompt?, plan?, chatHistory, lastObservation?, iterations, maxIterations, completionReason?, error? }`.
- `scripts/swarm/runner/__tests__/nodes.test.ts` — 14 tests covering each node's `NodeOutcome` shape.
- Test gate: `prisma validate`, `test:types`, `test:swarm:types`, `npm test` (4 suites / 32 + 1 skipped), `lint` (68 warnings / 0 errors — down from 78), `npm run build` — all PASS.
- No Dockerfile change: `pool-manager.ts` already bind-mounts the repo root at `/workspace`, so `lib/` reaches the worker at runtime.

## Frozen this pass
- Node topology: the 7-node sequence is the graph spine. Pass 11's Actor/Critic split will replace `propose_plan` and `evaluate_completion` internals; pass 14 adds `explore`; pass 15 rewrites `build_context`. Sequence order stays stable.
- `scripts/swarm/runner/` is the canonical location for node implementations.
- Import boundary: `scripts/` files may import from `@/lib/orchestration/*` per `scripts/tsconfig.json` path mapping + runtime bind-mount.

## Open carry-forward — MUST fix in pass 10
- **HTTP dispatch mismatch**: `scripts/swarm/docker-worker.ts:123` and `scripts/swarm/docker_exec_proxy.js:12` still POST to `http://localhost:8000/a2a`, but `agent-runner.ts` no longer serves HTTP. Containers spawned from the current `docker-worker` will connect to nothing. Pass 10 must rewire docker-worker → spawn the one-shot CLI (`node agent-runner.js <issueId>` or `npx tsx scripts/swarm/agent-runner.ts <issueId>`) and kill the `docker_exec_proxy.js` HTTP POST path, or retire the proxy entirely.
- Worker persistence still JSON (rolls into graph context during pass 10 resume wiring).
- 13 extra Tailwind files, scheduler wiring, dead-code cull — unchanged.
