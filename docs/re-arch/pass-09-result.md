# Pass 09 result

## Changed files
- `scripts/swarm/agent-runner.ts`: Replaced the HTTP-A2A server + 30-turn linear Gemini chat loop with a graph-driven `main()` that boots OTEL, builds a `StateGraph` from `defineAgentGraph()`, starts it with a `RunnerContext` for `AGENT_ISSUE_ID`, and pumps `transition()` calls until a terminal outcome. Legacy helpers (`translateWindowsPathToLinux`, `initializeMCPServers`, `baseToolCatalogue`, `runnerRuntime`) are re-exported for external callers.
- `scripts/tsconfig.json`: Added `swarm/runner/__tests__` to `exclude` (parity with existing `swarm/__tests__` exclusion per checkpoint-05 Jest-test policy).
- `jest.config.ts`: Added `<rootDir>/scripts/swarm/runner/__tests__/` to `testPathIgnorePatterns` so the new swarm test is not run by default `npm test`; must be invoked explicitly via `npx jest --testPathIgnorePatterns='/node_modules/' --testPathPatterns='scripts/swarm/runner/__tests__/nodes.test.ts'`.

## New files
- `scripts/swarm/runner/nodes.ts`: Seven-node `Node` registry + `defineAgentGraph()` factory built on the pass-8 `StateGraph` runtime. Node sequence: `init_mcp` → `build_context` → `propose_plan` → `execute_step` → (`record_observation` | `evaluate_completion`) → `commit_or_loop`. Tool dispatch, MCP boot, Gemini singleton, and a typed `RunnerContext` live here.
- `scripts/swarm/runner/__tests__/nodes.test.ts`: 14 Jest unit tests covering each node's outcome and context-patch shape, plus the registry wiring through `defineAgentGraph`.

## New symbols (with location)
- `RunnerChatMessage` at `scripts/swarm/runner/nodes.ts:50`
- `RunnerContext` at `scripts/swarm/runner/nodes.ts:55`
- `RunnerRuntime` at `scripts/swarm/runner/nodes.ts:105`
- `runnerRuntime` at `scripts/swarm/runner/nodes.ts:113`
- `translateWindowsPathToLinux` at `scripts/swarm/runner/nodes.ts:121`
- `initializeMCPServers` at `scripts/swarm/runner/nodes.ts:135`
- `baseToolCatalogue` at `scripts/swarm/runner/nodes.ts:269`
- `NODE_INIT_MCP` at `scripts/swarm/runner/nodes.ts:354`
- `NODE_BUILD_CONTEXT` at `scripts/swarm/runner/nodes.ts:355`
- `NODE_PROPOSE_PLAN` at `scripts/swarm/runner/nodes.ts:356`
- `NODE_EXECUTE_STEP` at `scripts/swarm/runner/nodes.ts:357`
- `NODE_RECORD_OBSERVATION` at `scripts/swarm/runner/nodes.ts:358`
- `NODE_EVALUATE_COMPLETION` at `scripts/swarm/runner/nodes.ts:359`
- `NODE_COMMIT_OR_LOOP` at `scripts/swarm/runner/nodes.ts:360`
- `nodes` at `scripts/swarm/runner/nodes.ts:698` (`Record<NodeName, Node>`)
- `defineAgentGraph` at `scripts/swarm/runner/nodes.ts:708`
- `main` at `scripts/swarm/agent-runner.ts:25` (exported at line 116)

## Deleted symbols
- None deleted. The legacy `agent-runner.ts` HTTP A2A server inline body (`const server = http.createServer(...)`, `const sessions: Record<string, ChatSession>`, `clear_context`, the inline 30-turn loop) was replaced; helpers were extracted to `scripts/swarm/runner/nodes.ts` and re-exported from `agent-runner.ts`.

## New deps
- None. `@google/generative-ai@^0.24.1`, `@modelcontextprotocol/sdk@^1.27.1`, `@jest/globals@^30.3.0`, and `@opentelemetry/api@^1.9.0` are already in `package.json`. `StateGraph` runtime is re-used from pass 8 under `lib/orchestration/graph/`.

## SDK signatures verified
- `GoogleGenerativeAI`, `SchemaType`, `GenerativeModel` — `node_modules/@google/generative-ai/dist/generative-ai.d.ts` (exported).
- `Client`, `StdioClientTransport` — `node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.d.ts` + `stdio.d.ts` (existing usage in `agent-runner.ts`, `pool-manager.ts`, `watchdog.ts`).
- `StateGraph`, `defineGraph`, `NodeOutcome`, `GraphContext`, `Node`, `NodeName` — `lib/orchestration/graph/index.ts` (pass 8, frozen per checkpoint-05 next-5-passes).
- `shareDiscovery`, `markTaskComplete`, `getSharedContext` — `scripts/swarm/shared-memory.ts:210/275/237` (pass 7, signatures unchanged).
- `startTracing`, `stopTracing`, `getTracer` — `scripts/swarm/tracing.ts:22/33/39`.

## Dockerfile change
- No edit needed. `scripts/swarm/Dockerfile.swarm-worker` uses `WORKDIR /workspace` and `scripts/swarm/pool-manager.ts:92` mounts the entire repo root (`mountVolume: absoluteRoot`) at `/workspace` when the MCP `run_container` tool boots a worker. `lib/` therefore reaches the worker at runtime at `/workspace/lib/`. The Dockerfile never did a blanket `COPY . .` — it copies only `package.json` + `package-lock.json*` for npm-install — but the volume mount overlays the whole repo at runtime, so a `COPY lib/` directive would be shadowed by the mount and provide no additional coverage.

## Dry-run node-sequence trace (synthetic task)
Input: `RunnerContext = { taskId: "t-1", agentCategory: "1_qa", modelId: "gemini-3.1-pro", worktreePath: "/workspace", instruction: "grep TODO in src/", chatHistory: [], iterations: 0, maxIterations: 5 }`.

1. `init_mcp`   → `{kind:"goto", next:"build_context", contextPatch:{ mcpTools: [] }}` (no MCP config on test host — emits the "Starting with base tools only" warning).
2. `build_context` → `{kind:"goto", next:"propose_plan", contextPatch:{ systemPrompt: "<packed MCP catalogue + shared context>" }}` (calls `getSharedContext("t-1")`).
3. `propose_plan` → `{kind:"goto", next:"execute_step", contextPatch:{ plan: "Plan for task t-1: …" }}`.
4. `execute_step` (iter 1, model returns `read_file` call) → `{kind:"goto", next:"record_observation", contextPatch:{ chatHistory:[...,{role:"model",content:"thinking..."}], lastObservation:{content:"<file>"}, iterations:1 }}`.
5. `record_observation` → `shareDiscovery("runner","t-1","Observation: {content:'<file>'}")`; `{kind:"goto", next:"execute_step", contextPatch:{ chatHistory:[...,{role:"tool",content:"..."}] }}`.
6. `execute_step` (iter 2, model returns `"All DONE."` with no function call) → `{kind:"goto", next:"evaluate_completion", contextPatch:{ chatHistory:[...,{role:"model",content:"All DONE."}], iterations:2 }}`.
7. `evaluate_completion` (last message contains `DONE`) → `{kind:"goto", next:"commit_or_loop", contextPatch:{ completionReason:"done_token" }}`.
8. `commit_or_loop` → `markTaskComplete("t-1","All DONE.")`; `{kind:"complete", contextPatch:{ completionReason:"done_token" }}`.

On the error branch (step 4 throws): `execute_step` patches `error:{message,stack}` and gotos `commit_or_loop`, which calls `markTaskComplete("t-1","FAILED: <msg>")` and returns `{kind:"error", error:<msg>}`.

## Verifier output
- `npx prisma validate`: PASS (`The schema at prisma\schema.prisma is valid`).
- `npm run test:types`: PASS (tsc clean).
- `npm run test:swarm:types`: PASS (tsc -p scripts/tsconfig.json clean).
- `npm test`: PASS (4 suites / 32 tests + 1 skipped — matches pass 8 baseline; pass-9 tests live under `scripts/swarm/runner/__tests__/` and are excluded from default run per spec).
- `npm run lint`: PASS (0 errors, 68 warnings — down from pass-8 baseline of 78, well under the ≤79 ceiling).
- `npx jest --testPathIgnorePatterns='/node_modules/' --testPathPatterns='scripts/swarm/runner/__tests__/nodes.test.ts'`: PASS (1 suite / 14 tests).
- `npm run build`: PASS (`Compiled successfully in 3.4s`).

## Open issues / deferred
- Pass 10 must add a graph-driven `resume-worker.ts` entry point and rewrite `watchdog.ts` so the new single-shot agent-runner is restartable after a kill. The old HTTP A2A path (`http://localhost:8000/a2a`, still referenced by `scripts/swarm/docker-worker.ts:123` and `scripts/swarm/docker_exec_proxy.js:12`) is now a dead callout until pass 10 wires the dispatcher → graph-runner path directly.
- Pass 11 replaces the placeholder `propose_plan` body with a real Actor call via `roles/actor.ts`.
- Pass 12 replaces the `evaluate_completion` `DONE`-regex heuristic with the rubric-driven Critic.
- Pass 15 replaces `build_context`'s static MCP-catalogue dump with `lib/orchestration/context-builder.ts` retrieval-packing.

## Cross-repo impact
- None. No edits to `wot-box`, `genkit`, `adk-python`, `adk-js`.
