# Pass 21 critic report

Scope reviewed: SCION operations console. Introspection module, 5 new
read-only API routes, 6 new client components, 4-tab dashboard reorganisation,
no schema changes.

## Findings
- C1 Symbol-grounding: PASS
  - `getConfigSnapshot` at `lib/orchestration/introspection.ts:274`, `getAbilities`
    at `:343`, `getWorkflow` at `:466`, `listLiveWorkers` at `:586` — all four
    confirmed present and exported.
  - `GRAPH_TOPOLOGY` (`:51`) covers all 8 nodes (`init_mcp → build_context →
    explore → propose_plan → execute_step ⇄ record_observation ⇄
    evaluate_completion → commit_or_loop`), matching
    `scripts/swarm/runner/nodes.ts` per checkpoint-15.
  - All 5 new route files export `GET` (verified by reading each).
  - All 6 new component files declare `export default` and `"use client"`.
  - `components/scion-dashboard.tsx` imports `LiveWorkers`, `WorkflowGraph`,
    `TraceSidebar`, `AbilityMatrix`, `ConfigPanel`, `MemoryBrowser` and routes
    them into the 4-tab layout (Operations / Workflow / Abilities / Memory).
    Operations retains `TopographyTree`, `GlobalLedger`, `GoalTracker`,
    `IssueInbox` and gains `LiveWorkers` — existing layout preserved.
  - `app/globals.css` modification present (pass-21 section).
- C2 Hedge-word scan: PASS (zero hits across the hedge pattern set on
  `docs/re-arch/pass-21-result.md`).
- C3 Test gate: PASS
  - `npx prisma validate` — exit 0 ("The schema at prisma\\schema.prisma is
    valid").
  - `npm run test:types` — exit 0, no errors.
  - `npm run test:swarm:types` — exit 0, no errors.
  - `npm test` — 27 suites passed, 1 suite skipped, 1 suite failed. The only
    failure is `scripts/swarm/roles/__tests__/actor-critic.test.ts` (3 tests,
    5-second timeout under parallel workers) — the exact pre-existing flake
    documented in the Actor's report with verification method (git-stash
    baseline comparison). No new failures in any other suite.
  - `npm run lint` — 0 errors, 68 warnings (all pre-existing `_`-prefixed
    unused-arg warnings). One below the 69 baseline claimed by the Actor.
  - `npm run build` — exit 0. All 5 new routes registered:
    `/api/scion/abilities`, `/api/scion/config`, `/api/scion/memory`,
    `/api/scion/workers`, `/api/scion/workflow/[id]`.
  - 6 new test suites run individually: 5 run together produce 27/27 tests
    passing; `workflow/[id]` run separately produces 5/5 passing. All 6 suites
    green.
- C4 Schema conformance: PASS. All required sections present in result
  (`Changed files`, `New files`, `New symbols`, `Deleted symbols`, `New deps`,
  `New API routes`, `Dashboard tab layout`, `Verifier output`, `Open issues`,
  `Cross-repo impact`). `New deps` lists none, which is correct — no
  package.json diff vs pass-20 commit `be892f8d`.
- C5 Deletion safety: N/A (no deletions).
- C6 Migration policy: N/A (no `prisma/schema.prisma` or
  `prisma/migrations/` changes).
- C7 SDK signature verification: PASS. New SDK surface is limited to
  `NextResponse.json(body, { headers })`, `spawnSync` from node:child_process,
  `fs.readFileSync/existsSync`, Prisma query methods already used elsewhere.
  None require external SDK attestation beyond what the existing routes have
  established.
- C8 Boundary discipline: PASS. Git status confirms no edits to sibling repos
  (`wot-box`, `genkit`, `adk-python`, `adk-js`), no edits to `cloudbuild.yaml`,
  no new root files. All changes scoped to `app/`, `components/`, `lib/`,
  `docs/re-arch/`.

## Pass-21-specific checks
1. **Secret leakage (envSanity values never exposed)**: PASS.
   - Read `lib/orchestration/introspection.ts:93-97` — `ConfigSnapshotEnvEntry`
     is `{ key: string; present: boolean; sensitive: boolean }`. No `value`
     field.
   - `envSanitySnapshot()` (`:204-210`) returns only `{ key, present,
     sensitive }` per entry; never returns `raw`.
   - `introspection.test.ts:95-102` asserts that after setting
     `GEMINI_API_KEY="secret-value-must-not-leak"`, the serialised snapshot
     does NOT contain the secret string. Test passes.
2. **No Tailwind in new components**: PASS. Grep for
   `\b(flex|grid|gap-\d|p-\d|mt-\d|text-(?:xl|2xl|3xl|sm)|bg-(?:slate|sky|emerald|red))\b`
   inside `className="..."` across the 6 new component files returned zero
   hits.
3. **WorkflowGraph is inline SVG, not Mermaid**: PASS.
   - `components/orchestration/WorkflowGraph.tsx` uses `<svg viewBox=...>`
     with inline `<rect>`, `<text>`, `<path>`, `<g>` elements.
   - No `mermaid` import in `WorkflowGraph.tsx` or anywhere under
     `components/orchestration/`. No `react-mermaid*` string anywhere in
     `package.json`.
4. **No new top-level deps**: PASS. `git diff be892f8d -- package.json` is
   empty. Only `package-lock.json` changed (lockfile); no new dep entries.
5. **Cache-Control: no-store on every new GET route**: PASS. Grep confirms
   every new route file contains `"Cache-Control": "no-store"` on both the
   success path and every error path (200, 400, 404, 500).
6. **`listLiveWorkers` graceful fallback**: PASS.
   - `introspection.ts:586-598` wraps `spawnSync("docker", …)` in a
     try/catch; when `result.error`, `result.status !== 0`, or the catch
     branch triggers, returns `[]`.
   - `introspection.test.ts:219-233` covers both fallback paths: docker
     exit 127 (status non-zero) and thrown error; both assert `[]`.
7. **`getConfigSnapshot.graphTopology` hard-coded to match
   `scripts/swarm/runner/nodes.ts`**: PASS. The 8 nodes (`init_mcp`,
   `build_context`, `explore`, `propose_plan`, `execute_step`,
   `record_observation`, `evaluate_completion`, `commit_or_loop`) and the 11
   edges (including `explore → explore`, `execute_step ⇄
   record_observation`, `execute_step ⇄ evaluate_completion`,
   `evaluate_completion → execute_step` re-entry, and
   `execute_step → commit_or_loop` on error) match the contract in
   `introspection.ts:51-75`.
8. **Dashboard tab layout preserves existing Operations content**: PASS.
   - Operations tab (lines 107-120 of `scion-dashboard.tsx`) contains
     `TopographyTree`, `GlobalLedger`, `GoalTracker`, `IssueInbox` in the
     `orchestration-grid`, then `LiveWorkers` below.
   - Workflow tab: issue selector + `WorkflowGraph` + `TraceSidebar`.
   - Abilities tab: `AbilityMatrix` + `ConfigPanel`.
   - Memory tab: `MemoryBrowser`.
   - `ExecuteDialog` and the header remain outside the tab region, preserving
     the existing page chrome.

## Verdict
PASS

## One-line reason
All rubric checks and pass-21-specific checks verified; the sole test failure
is the documented pre-existing `actor-critic.test.ts` parallel-worker timeout
flake, and no new regressions.
