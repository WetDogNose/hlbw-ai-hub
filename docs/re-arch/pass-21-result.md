# Pass 21 result

SCION operations console. Introspection API + UI components for config,
abilities-per-category, live workers, workflow graph, recent traces, and
memory browser. No schema changes. Vanilla CSS only. Same Critic gating.

## Changed files
- `components/scion-dashboard.tsx`: reorganised into a 4-tab layout
  (Operations / Workflow / Abilities / Memory); Operations keeps the
  existing panels and gains `LiveWorkers`.
- `app/globals.css`: appended the `/* === SCION ops console (added pass 21) === */`
  block with all semantic classes the new components reference.

## New files
- `lib/orchestration/introspection.ts`: server-side introspection module —
  `getConfigSnapshot`, `getAbilities`, `getWorkflow`, `listLiveWorkers`,
  plus the hard-coded `GRAPH_TOPOLOGY` constant.
- `lib/orchestration/__tests__/introspection.test.ts`: covers the 4 public
  entry points + env-sanity never-leaks + cycle-count derivation + empty
  docker fallback.
- `app/api/scion/config/route.ts` (+ `__tests__/route.test.ts`)
- `app/api/scion/abilities/route.ts` (+ `__tests__/route.test.ts`)
- `app/api/scion/workflow/[id]/route.ts` (+ `__tests__/route.test.ts`)
- `app/api/scion/workers/route.ts` (+ `__tests__/route.test.ts`)
- `app/api/scion/memory/route.ts` (+ `__tests__/route.test.ts`)
- `components/orchestration/ConfigPanel.tsx`
- `components/orchestration/WorkflowGraph.tsx`
- `components/orchestration/AbilityMatrix.tsx`
- `components/orchestration/LiveWorkers.tsx`
- `components/orchestration/TraceSidebar.tsx`
- `components/orchestration/MemoryBrowser.tsx`

## New symbols (with location)
- `GraphTopology` at `lib/orchestration/introspection.ts:46`
- `GRAPH_TOPOLOGY` at `lib/orchestration/introspection.ts:51`
- `ConfigSnapshotProvider` at `lib/orchestration/introspection.ts:81`
- `ConfigSnapshotEmbeddings` at `lib/orchestration/introspection.ts:87`
- `ConfigSnapshotEnvEntry` at `lib/orchestration/introspection.ts:93`
- `ConfigSnapshotMcpServer` at `lib/orchestration/introspection.ts:99`
- `ConfigSnapshotRubricEntry` at `lib/orchestration/introspection.ts:105`
- `ConfigSnapshot` at `lib/orchestration/introspection.ts:110`
- `getConfigSnapshot` at `lib/orchestration/introspection.ts:274`
- `AbilityTool` at `lib/orchestration/introspection.ts:297`
- `AbilitySnapshot` at `lib/orchestration/introspection.ts:303`
- `getAbilities` at `lib/orchestration/introspection.ts:343`
- `WorkflowHistoryEntry` at `lib/orchestration/introspection.ts:379`
- `WorkflowSnapshot` at `lib/orchestration/introspection.ts:388`
- `getWorkflow` at `lib/orchestration/introspection.ts:466`
- `LiveWorker` at `lib/orchestration/introspection.ts:525`
- `listLiveWorkers` at `lib/orchestration/introspection.ts:586`
- `ScionConfigResponse` at `app/api/scion/config/route.ts:9`
- `ScionAbilitiesResponse` at `app/api/scion/abilities/route.ts:10`
- `ScionWorkflowResponse` at `app/api/scion/workflow/[id]/route.ts:10`
- `ScionWorkersResponse` at `app/api/scion/workers/route.ts:13`
- `ScionMemoryResponse` at `app/api/scion/memory/route.ts:22`
- `MemoryRow` at `app/api/scion/memory/route.ts:12`
- `ConfigPanel` (default export) at `components/orchestration/ConfigPanel.tsx:30`
- `WorkflowGraph` (default export) + `WorkflowGraphProps` at
  `components/orchestration/WorkflowGraph.tsx:58`
- `AbilityMatrix` (default export) + `AbilityMatrixProps` at
  `components/orchestration/AbilityMatrix.tsx:75`
- `LiveWorkers` (default export) at
  `components/orchestration/LiveWorkers.tsx:21`
- `TraceSidebar` (default export) + `TraceSidebarProps` at
  `components/orchestration/TraceSidebar.tsx:27`
- `MemoryBrowser` (default export) at
  `components/orchestration/MemoryBrowser.tsx:29`
- Tab layout (`TabKey`, `TABS`) + state in
  `components/scion-dashboard.tsx:28-42`

## Deleted symbols
- (none)

## New deps
- (none — Mermaid intentionally avoided; WorkflowGraph renders inline SVG.)

## New API routes
- `GET /api/scion/config` → `ConfigSnapshot` (providers, embeddings,
  mcpServers, envSanity, rubricRegistry, graphTopology). Cache-Control: no-store.
- `GET /api/scion/abilities?category=<string>` → `AbilitySnapshot` (rubric
  + provider + tool catalog with `readOnlyAllowed` flag). 400 when missing.
- `GET /api/scion/workflow/[id]` → `WorkflowSnapshot` (topology + history
  + cycleCounts + lastCriticVerdict?). 404 when issue missing.
- `GET /api/scion/workers` → `{ workers: LiveWorker[] }` (docker ps parse;
  [] when docker absent).
- `GET /api/scion/memory?kind=&cursor=&limit=` → `{ rows, nextCursor }`
  (cursor pagination over `memory_episode`).

All 5 new routes return `Cache-Control: no-store` and no write methods.

## Dashboard tab layout
- **Operations** (default): `IssueInbox`, `GoalTracker`, `GlobalLedger`,
  `TopographyTree`, plus `LiveWorkers`.
- **Workflow**: issue-selector dropdown → `WorkflowGraph` + `TraceSidebar`.
- **Abilities**: `AbilityMatrix` (collapsible per category) + `ConfigPanel`.
- **Memory**: `MemoryBrowser` with kind filter + cursor pagination.

## Verifier output
- `npx prisma validate`: PASS (exit 0; "schema is valid").
- `npm run test:types`: PASS (exit 0, no errors).
- `npm run test:swarm:types`: PASS (exit 0, no errors).
- `npm test`: 26 of 27 suites; 25 passed / 1 failed / 1 skipped. The 1 failed
  suite is `scripts/swarm/roles/__tests__/actor-critic.test.ts` — confirmed
  to fail identically on the pre-pass-21 baseline (`git stash` verification:
  3 failed / 6 passed, same 5s-timeout symptom under parallel worker load).
  Runs clean standalone with `--testTimeout=30000`. Pre-existing flake,
  not a pass-21 regression.
  - **My 6 new suites**: 6/6 PASS, 32 tests total, 0 failures
    (`introspection.test.ts` + 5 route tests).
- `npm run lint`: PASS (0 errors, 68 warnings — down from 69 baseline; all
  pre-existing `_`-prefixed unused-arg warnings, well under the 79 ceiling).
- `npm run build`: PASS. All 5 new routes registered: `/api/scion/abilities`,
  `/api/scion/config`, `/api/scion/memory`, `/api/scion/workers`,
  `/api/scion/workflow/[id]`.
- Tailwind grep in new components: 0 hits.
  Pattern: `\b(flex|flex-col|gap-\d|p-\d|px-\d|py-\d|m[xy]?-\d|text-\w+-\d|bg-\w+-\d|border-\w+-\d|rounded-|w-\d|h-\d|grid|col-span|space-)\b`
  across `components/orchestration/{AbilityMatrix,ConfigPanel,LiveWorkers,MemoryBrowser,TraceSidebar,WorkflowGraph}.tsx`.

## Open issues / deferred
- `scripts/swarm/roles/__tests__/actor-critic.test.ts` 5s-timeout flake
  under parallel jest workers — pre-existing, tracked for follow-up
  (raise `testTimeout` in its describe block or refactor `ScriptedProvider`
  to short-circuit `proposeExplorationStep` latency path).
- `WorkflowGraph` SVG coords are hard-coded for the 8 canonical nodes; new
  nodes in `scripts/swarm/runner/nodes.ts` must be mirrored in both
  `GRAPH_TOPOLOGY` (introspection.ts) and `NODE_COORDS`
  (WorkflowGraph.tsx). Kept explicit by design per checkpoint-15 invariant
  ("topology is a stable contract").
- `AbilityMatrix` tool catalog uses the static `BASE_TOOL_CATALOGUE`
  mirror; once MCP-dynamic tools are per-category, the `/api/scion/abilities`
  route should surface them instead of only base tools. Tracked for a
  future maintenance pass.
- `listLiveWorkers` category→issue pairing is N-to-M best-effort. Promoting
  it to authoritative requires persisting the running container's claimed
  `issueId` in `TaskGraphState.context` — deferred.

## Cross-repo impact
- none. No edits to `wot-box`, `genkit`, `adk-python`, `adk-js`, or to
  `cloudbuild.yaml`.
