# HLBW AI Hub — 20-Pass Re-Architecture Plan

> **Status**: draft, not yet executed. Each pass writes a result artifact to `docs/re-arch/pass-NN-result.md` and a critic verdict to `docs/re-arch/pass-NN-critic.md` before proceeding.

---

## 0. Current state — what's actually there

I read the code. Three swarming/orchestration subsystems exist in parallel and barely talk to each other.

### A. Home-grown swarm — `scripts/swarm/` (real, working)
- ~30 TS files: [agent-runner.ts](../../scripts/swarm/agent-runner.ts), [docker-worker.ts](../../scripts/swarm/docker-worker.ts), [arbiter.ts](../../scripts/swarm/arbiter.ts), [pool-manager.ts](../../scripts/swarm/pool-manager.ts), [shared-memory.ts](../../scripts/swarm/shared-memory.ts), [tracing.ts](../../scripts/swarm/tracing.ts), [policy.ts](../../scripts/swarm/policy.ts), [watchdog.ts](../../scripts/swarm/watchdog.ts), [providers.ts](../../scripts/swarm/providers.ts), …
- State store: `.agents/swarm/state.json` (JSON file).
- Memory: Neo4j via `shared-memory.ts`.
- Worker: Docker container per task, MCP-gated by category (`1_qa`, `4_db`, …).
- Has its own type model (`types.ts: Task`, `Worker`, `SwarmState`).

### B. SCION — `app/api/scion/*`, `components/scion-dashboard.tsx`, `app/admin/scion/` (UI exists, plumbing is stubs)
- Postgres-backed via Prisma: `Thread`, `Issue`, `Routine`, `BudgetLedger`.
- [`/api/scion/execute`](../../app/api/scion/execute/route.ts): creates an `Issue`, returns. Nothing dequeues it.
- [`/api/orchestrator/heartbeat`](../../app/api/orchestrator/heartbeat/route.ts): scans hung issues, returns counts. **Triggers nothing.**
- [`/api/orchestrator/stream`](../../app/api/orchestrator/stream/route.ts): emits 15 fake debug lines.
- [`scion-dashboard.tsx`](../../components/scion-dashboard.tsx): heavy Tailwind utility classes (`flex flex-col gap-8 p-8 …`) — direct violation of the project's vanilla-CSS rule.
- [`lib/orchestration/db-sync.ts`](../../lib/orchestration/db-sync.ts): `lockIssueForWorkload` + `unlockIssue` exist. **No callers.**

### C. Paperclip — `tools/docker-paperclip/Dockerfile` (island)
- Container: `paperclipai` + `aider-chat` + `claude-code` CLI + LiteLLM proxy faking Anthropic API → local Ollama (`qwen2.5-coder:32b`).
- Listens on 3100/3101 via socat. No interface to swarm or SCION. No provider plug-in.

### Disconnects, summarized
| Concern | Swarm (A) | SCION (B) | Paperclip (C) |
| --- | --- | --- | --- |
| Task model | `Task` (JSON) | `Issue` (Postgres) | n/a |
| Queue | `arbiter.ts` reads JSON | none | none |
| Memory | Neo4j | `BudgetLedger` only | none |
| Trigger | `docker-worker.ts` CLI | `Issue.create` (dead-end) | manual |
| Provider | Gemini + Ollama in `providers.ts` | n/a | LiteLLM-proxied Anthropic |
| Context build | static MCP tool dump in `agent-runner.ts:36-127` | n/a | n/a |
| UI | none | Tailwind-based dashboard | none |

### Architectural debt to retire
- Two task models (Task vs Issue), two memory stores (Neo4j vs Postgres ledger), two style systems (vanilla CSS rule vs Tailwind in SCION).
- Static context window: [agent-runner.ts](../../scripts/swarm/agent-runner.ts) boots all configured MCP servers and dumps every tool definition into the Gemini chat regardless of task. **No retrieval, no relevance ranking.** This is the core "SCION swarming doesn't build context dynamically" problem.
- Linear chat loop in `agent-runner.ts` — no graph, no resumable state, no actor/critic separation. Watchdog kills hung workers but loses all their progress.
- `arbiter.ts` JSON file lock is the entire task queue. Cloud Run can't share it. Concurrency-unsafe across hosts.

---

## 1. Architectural target — the four directives, mapped

The Q1 2026 directives from the user's brief, applied to *this* codebase:

| Directive | Concrete target in this repo |
| --- | --- |
| **1. Stateful graph orchestration** | New `lib/orchestration/graph/` (StateGraph + persistent GraphState in Postgres). `agent-runner.ts` becomes a graph runner. Watchdog kills workers but graph state survives; workers resume from last node. |
| **2. Test-time interaction scaling** | New `lib/orchestration/explorer.ts`: Actor gets a read-only exploration budget (Grep/Read/MCP-`get_*`) before producing a plan. Replaces "predict the optimal path from step zero" in current loop. |
| **3. Actor / Critic / Orchestrator separation** | Split `agent-runner.ts` into `actor.ts` + `critic.ts` + `orchestrator.ts`. Critic gets only the proposal + rubric — never Actor's reasoning. Per-category rubrics in `lib/orchestration/rubrics/`. |
| **4. Turn-PPO seam (deferrable)** | `lib/rl/turn-critic.ts` interface + `record_turn_advantage` callback in orchestrator. No training code; just the seam. Pass 19, marked optional. |

Plus the user's specific ask:
- **SCION swarming actually works** = SCION's UI/queue (Postgres) and the swarm's worker (Docker) are unified at the orchestrator boundary. Pass 16.
- **Dynamic context window** = `lib/orchestration/context-builder.ts` retrieves task-relevant code symbols + episodic memory + recent traces, packs by relevance density. Pass 15.

---

## 2. Anti-hallucination protocol for YOLO TURBO-ALL execution

This is the section the user explicitly asked to be strengthened. Without these guards, a 20-pass autonomous run will silently drift into invented APIs, wrong file paths, and "I refactored X" claims with no actual diff. The strategy is **proactive context compression** (we shrink before the harness has to) plus **symbol-grounded verification** (every claim is checked against tools, not memory).

### 2.1 Roles in the execution loop

```
┌────────────┐  brief  ┌──────────┐  diff   ┌───────────┐
│ Dispatcher │────────▶│  Actor   │────────▶│   Critic  │
│ (tiny ctx) │         │ (ephem.) │         │ (ephem.)  │
└────────────┘◀────────┴──────────┘◀────────┴───────────┘
       ▲   verdict + artifact paths only
       │
       └── reads only: PLAN.md (this pass), latest checkpoint, verdict file
```

- **Dispatcher**: persistent across passes. Holds *zero* code, *zero* diffs, *zero* exploration output. Holds only: pointer to current pass, path to latest checkpoint, last verdict. If the dispatcher's own context ever exceeds **20k tokens of accumulated tool output**, it MUST emit a self-handoff doc (`docs/re-arch/dispatcher-handoff.md`) and terminate so a fresh dispatcher can take over.
- **Actor sub-agent**: spawned per pass via `Agent`. Receives a self-contained brief. Does the actual editing.
- **Critic sub-agent**: spawned per pass via `Agent`, fresh context, *no Actor history*. Receives only: pass spec + diff summary + rubric. Returns `PASS` or `REWORK` + findings.

### 2.2 Twelve hard rules — non-negotiable

1. **One pass = one fresh Actor + one fresh Critic.** Two `Agent` invocations per pass; no chaining, no shared context. The dispatcher never reads the Actor's intermediate exploration — only the final artifact paths the Actor returns.

2. **Symbol-grounding rule.** No code change may reference a symbol, file, function, or API that the agent has not Read or Grepped *in this pass*. If a symbol doesn't exist yet, it must be created in this pass and Read back. Critic rubric explicitly Greps every new symbol cited in the pass artifact and FAILs if any is absent. This kills the dominant hallucination mode ("calls `MemoryStore.episodicQuery()` … which doesn't exist").

3. **Hard verification gate per pass.** A pass is "done" only when *all* of:
   - Every cited file path exists (verified via Read).
   - `npm run test:types` exit 0.
   - `npm run test:swarm:types` exit 0.
   - `npm test` exit 0 (existing tests + any added in the pass).
   - `npm run lint` no new errors.
   - `docs/re-arch/pass-NN-result.md` exists with the **mandatory schema** (section 2.5 below).
   The dispatcher runs the test commands and Greps each cited new symbol before advancing.

4. **Critic pass after every Actor pass.** Apply directive #3 to ourselves. Critic rubric in `docs/re-arch/critic-rubric.md` (created in pass 1). Max 3 rework loops; if still failing, pause and escalate to user.

5. **Forced compaction at every pass boundary** (not just 5/10/15). After each pass's verdict:
   - Dispatcher writes `pass-NN-verified.md` (≤300 words: what changed, what froze, what's open).
   - Dispatcher *discards* the Actor's full result file from its working set; only the verified summary stays.
   - Every 5 passes (5/10/15), write a `checkpoint-NN.md` that *replaces* the prior 5 verified summaries in the dispatcher's working set.
   - At any point, the dispatcher's loaded re-arch context = (most recent checkpoint) + (verified summaries since that checkpoint) + (current pass spec). Hard ceiling: ≤4 documents.

6. **Sub-agent context budget.** Each Actor sub-agent has a hard turn cap of **40 tool calls**. At turn 30 the Actor must write a `pass-NN-WIP.md` snapshot and either (a) finish in the remaining 10 turns, or (b) terminate cleanly so the dispatcher launches a fresh Actor that resumes from the WIP snapshot. *Never* let a sub-agent burn through its window and degrade.

7. **Cache-window discipline.** The Anthropic prompt cache TTL is 5 minutes. The dispatcher schedules pass dispatches back-to-back (no idle gaps >4 min) so the system prompt + checkpoint stays warm. If a pass needs to wait on a long build/test, use `run_in_background` and continue, don't sleep.

8. **No invented versions or APIs.** Any new dep requires `npm view <pkg> version` (or `pip index versions <pkg>`) and a pinned version in `package.json`. Any SDK call requires Reading the installed `node_modules/<pkg>/package.json` + the `.d.ts` to confirm the signature. Critic rubric checks for this with Grep.

9. **Hedge-word trip-wire.** Critic rubric automatically FAILs any artifact containing: "should work", "in theory", "I think", "probably", "might", "appears to", "seems to", "likely". Hedges force a verification tool call, not a guess.

10. **No deletions without grep.** Before deleting a file or symbol, run `Grep` across the workspace (including sibling repos `wot-box`, `genkit`, `adk-python`, `adk-js`). If inbound refs exist, migrate them first or downgrade to deprecation.

11. **DB migrations are user-gated.** Any `prisma/schema.prisma` change pauses for explicit user `migrate dev` confirmation. No silent `db push --accept-data-loss`. Encoded in the Critic rubric.

12. **Resumable from any pass.** `pass-NN-verified.md` + the most recent `checkpoint-NN.md` together must be sufficient to restart from pass NN+1 in a clean session, on a different machine, by a different model. This makes YOLO interruption-safe.

Plus three boundary rules:
- **No production deploys mid-plan.** [cloudbuild.yaml](../../cloudbuild.yaml) is frozen during the re-arch. The plan ends with one explicit deploy in pass 20.
- **Sibling repos are read-only.** The plan only touches `hlbw-ai-hub`. Cross-repo work is logged as an open issue, never made silently.
- **No new top-level files at repo root.** All re-arch artifacts go under `docs/re-arch/`. New code goes under existing dirs (`lib/orchestration/`, `scripts/swarm/roles/`, etc.).

### 2.3 Context compression — when, what, how

The single biggest hallucination driver in long autonomous runs is context bloat: the model loses precision as the prompt approaches its limit and the harness silently auto-compacts mid-thought. The protocol below compresses *proactively* at known-safe boundaries so auto-compact never fires.

**When to compress** (forced, not opportunistic):
- **End of every pass**: dispatcher writes `pass-NN-verified.md` (≤300 words) and drops the Actor's full result from its working set.
- **Every 5 passes**: dispatcher writes `checkpoint-NN.md` that *replaces* the prior 5 verified summaries in the working set.
- **Sub-agent turn 30 of 40**: Actor writes `pass-NN-WIP.md` snapshot; if not done by turn 40 it terminates and a fresh Actor resumes from the snapshot.
- **Dispatcher tool-output budget exceeds 20k tokens**: dispatcher writes `dispatcher-handoff.md` and terminates; user re-launches.

**What to keep vs. drop** (the compression contract):

| Artifact | Content | Lifetime in dispatcher context |
| --- | --- | --- |
| `PLAN.md` (this file) | The 20 passes + protocol | Always loaded |
| `critic-rubric.md` | Pass/fail criteria | Always loaded |
| `checkpoint-NN.md` | Frozen interfaces, invariants, deletions, open issues | Until the next checkpoint replaces it |
| `pass-NN-verified.md` | ≤300-word summary | Until rolled into the next checkpoint |
| `pass-NN-result.md` | Actor's full diff + reasoning | Read once by dispatcher for verification, then discarded |
| `pass-NN-critic.md` | Critic's findings | Read once for verdict, then discarded |
| `pass-NN-WIP.md` | Actor's mid-pass snapshot | Consumed by the resuming Actor, then discarded |

**How to compress** (the contract enforced by Critic):
- Every `pass-NN-verified.md` follows the schema in section 2.5. ≤300 words. No prose narrative — bullets only.
- Every `checkpoint-NN.md` is ≤800 words. Lists frozen interfaces by name + path, not signatures.
- Symbols introduced in earlier passes that are NOT referenced in any pass-NN-verified.md from the last 5 passes are assumed stable; no need to repeat them.

**Why this prevents auto-compact-driven drift**: the harness's auto-compaction summarizes whatever happens to be in context, lossily, with no schema. Our forced compaction writes structured artifacts the model can re-load deterministically. We never let raw conversation grow past the boundary that would trigger auto-compact in the first place.

### 2.4 Pre-pass freshness check (sub-agent self-test)

Every Actor sub-agent runs a 3-step self-test as its first action, before any edit:

1. Read the pass spec from `docs/re-arch/PLAN.md` (the specific pass section only).
2. Read the most recent `checkpoint-NN.md`.
3. Read one specific file cited in the pass spec and Grep for one specific symbol cited in the latest checkpoint. Confirm both exist.

If any step fails, the Actor terminates immediately with a `pass-NN-blocked.md` artifact naming the missing precondition. The dispatcher escalates to the user — no guessing forward.

This catches the failure mode where a sub-agent has been launched against a stale or wrong checkpoint and would otherwise invent fixes against fictional state.

### 2.5 Mandatory artifact schemas

**`pass-NN-result.md`** (Actor output, full):
```markdown
# Pass NN result
## Changed files
- path/to/file.ts: <one-line what>
## New symbols (with location)
- `SymbolName` at path/to/file.ts:LINE
## Deleted symbols
- `OldName` (was at path/old.ts) — verified zero inbound refs via grep
## New deps
- pkg-name@x.y.z (verified via `npm view`)
## Verifier output
- npm run test:types: PASS
- npm run test:swarm:types: PASS
- npm test: PASS (N tests, M new)
- npm run lint: PASS
## Open issues / deferred
- ...
## Cross-repo impact
- none / list
```

**`pass-NN-critic.md`** (Critic output):
```markdown
# Pass NN critic verdict
## Verdict: PASS | REWORK | ESCALATE
## Findings
- Symbol-grounding: PASS/FAIL (greps run: ...)
- Hedge-word scan: PASS/FAIL (matches: ...)
- Test gate: PASS/FAIL
- Schema conformance: PASS/FAIL
- Migration policy: PASS/FAIL/N-A
## If REWORK
- Specific things to fix, with file:line where possible
```

**`pass-NN-verified.md`** (dispatcher output, ≤300 words):
```markdown
# Pass NN verified
## What's now true
- 3-5 bullets, present tense
## Frozen this pass
- interface/file: brief
## Open carry-forward
- 1-3 bullets
```

**`checkpoint-NN.md`** (every 5 passes, ≤800 words):
```markdown
# Checkpoint after pass NN
## Frozen interfaces (name → path)
## Live invariants
## Deletions confirmed
## Open issues carrying forward
## Next-5-passes context payload
```

**`dispatcher-handoff.md`** (only on dispatcher termination):
```markdown
# Dispatcher handoff at pass NN
## Last completed pass + verdict file
## Most recent checkpoint
## Why handing off (token budget / user pause / failure)
## Exact next action for incoming dispatcher
```

### 2.6 Why this is enough

The combined effect:
- **Dispatcher context never grows** (rule 5 + section 2.3 + 2.5). Auto-compact never fires because we pre-empted it.
- **Symbol fabrication dies at the verifier** (rule 2 + Critic rubric). The Critic Greps every cited new symbol; missing ones FAIL the pass.
- **Stale-state drift dies at the freshness check** (section 2.4). A sub-agent launched against the wrong checkpoint terminates before doing damage.
- **Sub-agent context degradation dies at the turn cap** (rule 6). At turn 30 the Actor snapshots; the next Actor starts fresh. No "I've been thinking for 80 turns and now I'm confused" failure.
- **Hedge-driven invention dies at the trip-wire** (rule 9). "Should work" forces a tool call.
- **API hallucination dies at the version pin** (rule 8). No SDK call without Reading the `.d.ts`.
- **YOLO is interruption-safe** (rule 12 + handoff schema). Resume from any pass on any machine.

A 20-pass autonomous run with these guards is qualitatively different from "let the model just keep going". The dispatcher is a stateless verifier; the work happens in disposable sub-agents whose context is born and dies inside one pass; every claim is checked by a fresh adversarial Critic before it counts.

---

## 3. The 20 passes

Each pass header lists: **Goal · Touches · New artifacts · Verifier extras**. The verifier always runs the standard gate (rule 3 above) on top.

### Phase A — Stabilize & map (passes 1–3)

#### Pass 1 — Inventory & dependency map
- **Goal**: produce a single source-of-truth map of what exists. No code changes.
- **Touches**: read-only across `scripts/swarm/`, `app/api/`, `components/`, `lib/`, `tools/`, `wrappers/`, `templates/`, `.agents/`.
- **New artifacts**: `docs/re-arch/INVENTORY.md` — every subsystem, owner files, in-bound/out-bound deps, dead-code candidates. `docs/re-arch/critic-rubric.md` — rubric the Critic uses for every subsequent pass.
- **Verifier extras**: spot-check 5 random inventory rows by Grep-ing for the cited symbol.

#### Pass 2 — Test floor
- **Goal**: lock a known-green baseline.
- **Touches**: any failing test or type error in `npm run test:types`, `npm run test:swarm:types`, `npm test`. Add minimal tests around `scripts/swarm/state-manager.ts`, `scripts/swarm/arbiter.ts`, `scripts/swarm/providers.ts` if missing.
- **New artifacts**: `docs/re-arch/pass-02-result.md` includes the exact test command outputs.
- **Verifier extras**: dispatcher re-runs the three commands and confirms identical pass counts.

#### Pass 3 — Style bankruptcy resolution
- **Goal**: end the vanilla-CSS-vs-Tailwind contradiction. The user's existing rule wins: vanilla CSS only.
- **Touches**: rewrite [components/scion-dashboard.tsx](../../components/scion-dashboard.tsx), [components/orchestration/*.tsx](../../components/orchestration/), [app/admin/scion/page.tsx](../../app/admin/scion/page.tsx) to use semantic class names defined in [app/globals.css](../../app/globals.css). Add the new `.scion-*` and `.orchestration-*` classes there using existing CSS variables.
- **New artifacts**: pass-03-result.md.
- **Verifier extras**: `Grep` for Tailwind utility patterns (`flex-col`, `gap-\d`, `p-\d`, `text-\w+-\d`) under `app/` and `components/` — must return zero hits.

### Phase B — Unify the state plane (passes 4–7)

#### Pass 4 — Single canonical task model
- **Goal**: collapse `Task` (swarm `types.ts`) and `Issue/Thread` (Prisma) into one entity. Postgres becomes source of truth; JSON state file becomes a read-through cache.
- **Touches**: extend `prisma/schema.prisma` with whatever fields `Task` has that `Issue` lacks (priority, blockedBy, isolationId, agentCategory, metadata). Update `scripts/swarm/types.ts` to import generated Prisma types or to re-export them. Migration drafted but **not run** — user-gated per rule 9.
- **New artifacts**: pass-04-result.md + `prisma/migrations/<timestamp>_unified_task/migration.sql` (drafted).
- **Verifier extras**: `npx prisma validate` exit 0; type-check still green with the swarm code referencing the new types.

#### Pass 5 — Single dispatcher (Postgres-backed) **+ COMPACTION CHECKPOINT**
- **Goal**: replace `arbiter.ts`'s JSON-file logic with Postgres queries (`SELECT … FOR UPDATE SKIP LOCKED`). Concurrency-safe across hosts.
- **Touches**: rewrite `scripts/swarm/arbiter.ts` to query Postgres. Keep the JSON file as a debug snapshot, not the queue. `state-manager.ts` writes through to Postgres.
- **New artifacts**: pass-05-result.md + **`docs/re-arch/checkpoint-05.md`** (frozen interfaces: `Task`/`Issue` model, Arbiter API).
- **Verifier extras**: integration test that two arbiter instances racing for the same task produce exactly one assignment (use `npm run test:db` infra).

#### Pass 6 — Heartbeat-driven dispatch
- **Goal**: `/api/orchestrator/heartbeat` actually triggers `docker-worker.ts` for ready issues. Add Cloud Scheduler entry in [cloudbuild.yaml](../../cloudbuild.yaml) (drafted, not deployed).
- **Touches**: [app/api/orchestrator/heartbeat/route.ts](../../app/api/orchestrator/heartbeat/route.ts) calls into the new dispatcher. New `lib/orchestration/dispatcher.ts` wraps `docker-worker.ts` for in-process invocation.
- **New artifacts**: pass-06-result.md.
- **Verifier extras**: `curl -X POST http://localhost:3000/api/orchestrator/heartbeat` against `npm run dev` actually starts a worker (mocked provider) and updates Issue.status.

#### Pass 7 — One memory layer
- **Goal**: pick *one* episodic memory store. Recommendation: **Postgres + pgvector** (already have Postgres; one fewer DB; survives Cloud Run cold start; queryable from SCION UI). Neo4j is retained only if the directives_graph use-case requires graph traversals — verifier checks usage first.
- **Touches**: new `lib/orchestration/memory/MemoryStore.ts` interface + `pgvector.ts` impl. Migrate writers in `scripts/swarm/shared-memory.ts` to call `MemoryStore`. Old Neo4j calls become a deprecated adapter.
- **New artifacts**: pass-07-result.md + Prisma migration draft for the `memory_episode` table with `vector(768)` embedding column.
- **Verifier extras**: `Grep` for direct `neo4j-driver` imports outside the deprecated adapter — must return zero.

### Phase C — Graph orchestration (passes 8–10)

#### Pass 8 — StateGraph runtime
- **Goal**: thin in-house StateGraph (node, edge, transition, persistent state) — no LangGraph dep unless the inventory in pass 1 shows we need it. Picking JS-native first to avoid a Python boundary in the worker.
- **Touches**: new `lib/orchestration/graph/StateGraph.ts`, `Node.ts`, `GraphState.ts`. Persistence: `task_graph_state` Prisma table (one row per task). Transition is atomic: write GraphState in same TX as Issue update.
- **New artifacts**: pass-08-result.md + jest tests covering `transition()`, `resume()`, `interrupt()`.
- **Verifier extras**: jest coverage for StateGraph ≥ 90%.

#### Pass 9 — Migrate `agent-runner.ts` to graph nodes
- **Goal**: convert the linear Gemini chat loop into discrete nodes: `init_mcp` → `build_context` → `propose_plan` → `critique_plan` → `execute_step` → `record_observation` → `evaluate_completion` → `commit_or_loop`.
- **Touches**: rewrite `scripts/swarm/agent-runner.ts` as a node registry + dispatcher into the StateGraph from pass 8. Existing functions (`initializeMCPServers`, `translateWindowsPathToLinux`, MCP boot) become node implementations.
- **New artifacts**: pass-09-result.md.
- **Verifier extras**: a dry-run worker (mocked provider) executes a synthetic task and the dispatcher reads exactly the expected node sequence from the persisted GraphState.

#### Pass 10 — Resume semantics + watchdog rewrite **+ COMPACTION CHECKPOINT**
- **Goal**: workers resume from the last persisted node after kill. Watchdog kills processes but never loses GraphState.
- **Touches**: `scripts/swarm/watchdog.ts` rewritten to mark workers `paused`, not delete state. New `scripts/swarm/resume-worker.ts` entry point. `pool-manager.ts` prefers resuming a paused task over starting a new one.
- **New artifacts**: pass-10-result.md + **`docs/re-arch/checkpoint-10.md`** (frozen: StateGraph API, Node contract, Resume API).
- **Verifier extras**: integration test: start worker, kill mid-task, resume, verify the second worker continues from the killed node.

### Phase D — Actor / Critic / Orchestrator (passes 11–13)

#### Pass 11 — Role separation
- **Goal**: split `agent-runner.ts`'s monolithic agent into three roles.
- **Touches**: new `scripts/swarm/roles/actor.ts`, `roles/critic.ts`, `roles/orchestrator.ts`. The orchestrator owns the StateGraph from pass 8 and routes between actor/critic. Actor proposes (plan or tool call); Critic scores; Orchestrator decides next node.
- **New artifacts**: pass-11-result.md.
- **Verifier extras**: jest test that confirms Critic prompt does **not** receive Actor's reasoning trace.

#### Pass 12 — Rubric registry + early stopping
- **Goal**: per-category rubrics in `lib/orchestration/rubrics/`. Categories: `1_qa`, `2_source_control`, `3_cloud`, `4_db`, `5_bizops`, plus a `default`. Confidence-score early-stopping (default ≥0.85, ≤3 critique cycles per node).
- **Touches**: new directory + a `loadRubric(category)` function. Critic loads it. Orchestrator enforces the cycle cap.
- **New artifacts**: pass-12-result.md.
- **Verifier extras**: jest test: synthetic Actor outputs that fail rubric drive exactly 3 cycles, then mark task `needs_human`.

#### Pass 13 — Context isolation enforcement
- **Goal**: hard prompt-boundary so Actor/Critic context separation can't drift.
- **Touches**: `roles/orchestrator.ts` constructs Critic prompts via a typed `CriticInput` (proposal + rubric only). Actor prompts via `ActorInput` (task + context window from pass 15 + last critique if rework). Both go through a single `lib/orchestration/prompts/render.ts` that asserts no cross-contamination at the type level.
- **New artifacts**: pass-13-result.md.
- **Verifier extras**: TypeScript-level assertion that `CriticInput` cannot accept `ActorReasoning`-typed fields.

### Phase E — Test-time interaction scaling + dynamic context window (passes 14–15)

#### Pass 14 — Exploration budget
- **Goal**: directive #2. Actor gets an `explorationBudget: 8` tool calls before producing a final plan. Allowed tools during exploration are read-only (Grep, Read, MCP `get_*`). Backtrack via graph node revisit.
- **Touches**: new `lib/orchestration/explorer.ts`. New graph node `explore` placed before `propose_plan`. `roles/actor.ts` enters exploration mode when budget > 0.
- **New artifacts**: pass-14-result.md.
- **Verifier extras**: integration test: Actor on a task with ambiguous spec uses ≥3 exploration tool calls before plan; on an unambiguous spec uses 0.

#### Pass 15 — Dynamic context-window builder **+ COMPACTION CHECKPOINT**
- **Goal**: this is the user's "SCION swarming builds context dynamically" deliverable. Replace the static MCP tool dump in `agent-runner.ts:initializeMCPServers` with retrieval-driven assembly.
- **Touches**: new `lib/orchestration/context-builder.ts`. Inputs: `(task, episodic memory store, code symbol index, recent traces)`. Output: token-budgeted window packed by relevance density (not raw tokens — Gemini 2.5's 1M is plenty; the constraint is signal-to-noise). Algorithm:
  1. Embed the task description (Vertex `text-embedding-004`).
  2. Top-k from `MemoryStore` (pass 7) where category matches.
  3. Top-k code symbols from a new `lib/orchestration/code-index.ts` (built on the existing AST analyzer MCP — symbol embeddings cached in Postgres).
  4. Recent OTEL trace summaries from the same task lineage.
  5. Pack: rubric → high-relevance memory → top symbols → tool catalog (filtered by category) → trace summaries → task instruction last.
- **New artifacts**: pass-15-result.md + **`docs/re-arch/checkpoint-15.md`** (frozen: ContextBuilder API, MemoryStore API, CodeIndex API).
- **Verifier extras**: a fixture task produces a window that contains the 3 known-relevant symbols and excludes the 5 known-irrelevant ones.

### Phase F — SCION ↔ Swarm ↔ Paperclip convergence (passes 16–17)

#### Pass 16 — SCION as the orchestrator UI
- **Goal**: SCION dashboard reads/writes the unified state. End the stub-ness.
- **Touches**:
  - [components/scion-dashboard.tsx](../../components/scion-dashboard.tsx), [components/orchestration/TopographyTree.tsx](../../components/orchestration/TopographyTree.tsx), [components/orchestration/GoalTracker.tsx](../../components/orchestration/GoalTracker.tsx), [components/orchestration/IssueInbox.tsx](../../components/orchestration/IssueInbox.tsx), [components/orchestration/GlobalLedger.tsx](../../components/orchestration/GlobalLedger.tsx) — fetch from new SWR endpoints reading the unified Issue/GraphState model.
  - [app/api/scion/execute/route.ts](../../app/api/scion/execute/route.ts) — write a graph-rooted Issue that the dispatcher (pass 6) picks up.
  - [app/api/orchestrator/stream/route.ts](../../app/api/orchestrator/stream/route.ts) — replace fake debug with real SSE off the OTEL span stream (anchored on `taskId`).
  - `BudgetLedger` — actually accumulate per-task spend from `providers.ts` token usage.
- **New artifacts**: pass-16-result.md.
- **Verifier extras**: e2e: click "Execute" in the dashboard → Issue created → dispatcher picks it up → worker runs (mocked provider) → SSE stream shows real node transitions → ledger updates.

#### Pass 17 — Paperclip as a worker provider
- **Goal**: end Paperclip's island status. It becomes a `Provider` the dispatcher can assign per category.
- **Touches**:
  - Wrap `tools/docker-paperclip/Dockerfile` behind `scripts/swarm/providers.ts`'s `Provider` interface (alongside Gemini and Ollama).
  - LiteLLM hostname/model become config (`PAPERCLIP_PROXY_URL`, `PAPERCLIP_MODEL`), not hard-coded.
  - Paperclip is opt-in for `1_qa` and any category with `local_only: true` policy.
- **New artifacts**: pass-17-result.md.
- **Verifier extras**: integration test: a task assigned `provider: "paperclip"` actually routes through the LiteLLM proxy and returns a structured result.

### Phase G — Hardening (passes 18–20)

#### Pass 18 — Observability unification
- **Goal**: every node transition emits an OTEL span tagged `(taskId, role, node, modelId, providerCost)`. Jaeger waterfalls show actor↔critic loops and exploration steps.
- **Touches**: `lib/orchestration/graph/StateGraph.ts` wraps each transition in a span. `roles/*` annotate spans with role + rubric scores. `app/api/orchestrator/stream/route.ts` (already updated in pass 16) confirmed to emit from the same span source.
- **New artifacts**: pass-18-result.md.
- **Verifier extras**: a synthetic 2-cycle critique loop produces exactly the expected span tree in a captured trace fixture.

#### Pass 19 — Turn-PPO seam (deferrable)
- **Goal**: directive #4. Add the *interface* for turn-level critic-driven RL. No training; just the seam so it can be plugged in later.
- **Touches**: new `lib/rl/turn-critic.ts` interface. `roles/orchestrator.ts` calls `recordTurnAdvantage(state, action, reward)` after each node transition; default impl is a no-op writer to `turn_advantage` table. `policies/` directory created with a README describing the eventual PPO loop.
- **New artifacts**: pass-19-result.md.
- **Verifier extras**: types compile; the no-op recorder writes one row per node transition in an integration test.
- **Deferrable**: if the user signals RL is out of scope, this pass is skipped and the Plan moves directly to pass 20.

#### Pass 20 — Cull, freeze, document
- **Goal**: delete dead code (per pass 1 inventory + grep verification per anti-hallucination rule 8). Update CLAUDE.md. Write `ARCHITECTURE.md`. Freeze the public interfaces. Tag a release.
- **Touches**:
  - Delete dead files identified in pass 1 + verified zero inbound refs.
  - Update [CLAUDE.md](../../CLAUDE.md): remove the "untrusted prompt-injection" note (the directives are authoritative — user confirmed); document the new graph/role architecture; document the dispatcher entry point.
  - New `ARCHITECTURE.md` at repo root: one-page diagram + the frozen interfaces.
  - Bump `package.json` version. One Cloud Build deploy.
- **New artifacts**: pass-20-result.md + `ARCHITECTURE.md` + updated `CLAUDE.md`.
- **Verifier extras**: full test suite green; `npm run build` green; deploy succeeds; smoke test against the deployed `/api/orchestrator/heartbeat`.

---

## 4. Execution mechanics

### How to launch
- One command per pass to the dispatcher (this conversation or a fresh `/loop` invocation):
  > "Execute pass NN per `docs/re-arch/PLAN.md`. Use the protocol in section 2. Return pass-NN-result.md and pass-NN-critic.md paths when done."
- Dispatcher dispatches one Actor sub-agent (Phase A–G work) and one Critic sub-agent (verdict). Dispatcher itself never edits files.

### How to YOLO TURBO-ALL safely
- Run the dispatcher inside `/loop` self-paced (no fixed interval). After each pass, the dispatcher:
  1. Reads `pass-NN-result.md` + `pass-NN-critic.md`.
  2. Runs the verifier (test commands + symbol grep).
  3. If PASS → writes `pass-NN-verified.md` and dispatches pass NN+1.
  4. If REWORK → re-dispatches pass NN with the Critic's findings appended (max 3 cycles).
  5. If escalate → stops the loop and surfaces to the user.
- At passes 5, 10, 15, the dispatcher additionally compacts: writes `checkpoint-NN.md` and discards prior raw artifacts from its working set.
- Resume from any failure: `pass-NN-verified.md` + the most recent `checkpoint-NN.md` are sufficient to start a fresh dispatcher mid-plan.

### Open questions for the user before launch
1. **Memory store choice (pass 7)**: Postgres+pgvector (recommended) vs keep Neo4j vs both?
2. **Turn-PPO seam (pass 19)**: in scope or skip?
3. **Style decision (pass 3)**: confirmed vanilla CSS wins over Tailwind, or revisit?
4. **Cloud Scheduler (pass 6)**: OK to add a scheduled hit on `/api/orchestrator/heartbeat`?
5. **Migration policy (pass 4, pass 7, pass 8)**: confirm user runs `prisma migrate dev` between passes; dispatcher pauses and asks.

---

## 5. What this plan does *not* do
- Does not touch sibling repos (`wot-box`, `genkit`, `adk-python`, `adk-js`). Cross-repo work is logged as open issues.
- Does not introduce LangGraph as a dependency unless pass 1 inventory shows a concrete reason. Default is in-house JS StateGraph for one-runtime simplicity.
- Does not implement RL training in pass 19 — only the seam.
- Does not change the GCP region (stays `asia-southeast1` per [cloudbuild.yaml](../../cloudbuild.yaml)).
- Does not rewrite the MCP wrappers in `wrappers/a2a/` or `wrappers/mcp/` — they're the standard contract the new system targets.

---

## 6. Post-pass-20 extensions — operations console (passes 21–24)

Pass 20 closed the original 20-pass scope. Operating the system surfaced a real gap: the SCION UI was a viewer, not a console. Passes 21–24 close that gap. Same Actor → Critic → verified protocol. Same critic-rubric. Same compression cadence.

### Pass 21 — SCION operations console (introspection — DONE)
**Status**: PASS, see [pass-21-verified.md](pass-21-verified.md).
- 5 read-only API routes (`/api/scion/{config,abilities,workflow/[id],workers,memory}`).
- 6 components (`ConfigPanel`, `WorkflowGraph`, `AbilityMatrix`, `LiveWorkers`, `TraceSidebar`, `MemoryBrowser`).
- 4-tab dashboard (Operations / Workflow / Abilities / Memory).
- `lib/orchestration/introspection.ts` is the canonical server-side introspection module.

### Pass 22 — operational write paths
**Goal**: every action you currently do via shell or DB poke becomes a button. Make the UI a real console.

- **New write routes** under `app/api/scion/`:
  - `POST /api/scion/heartbeat-now` — proxies the existing heartbeat with the shared secret so the UI can fire it; returns the same shape.
  - `POST /api/scion/watchdog-now` — runs `reclaimStaleWorkers` + the watchdog logic in-process.
  - `POST /api/scion/issue/[id]/cancel` — sets status=`cancelled`, GraphState→`failed` with reason="user_cancelled".
  - `POST /api/scion/issue/[id]/rerun` — clones the Issue (new id, status=`pending`, copies instruction/category/priority/metadata, blank graph state).
  - `POST /api/scion/issue/[id]/resume` — calls `StateGraph.resume` then enqueues a fresh worker for that issue.
  - `POST /api/scion/issue/[id]/resolve` — flips a `needs_human` Issue back to `pending` with a stored resolution note (writes `MemoryEpisode kind:"decision"`).
  - `PATCH /api/scion/issue/[id]` — narrow editor: priority, agentCategory, metadata. Status/dependencies/blockedBy stay system-managed.
  - `GET /api/scion/workers/[name]/logs` — `docker logs --tail 200` of the named worker.
  - `POST /api/scion/workers/[name]/kill` — `docker kill` the named worker.
  - `POST /api/scion/workers/[name]/restart` — `docker restart` the named worker.
  - `POST /api/scion/pool/restart` — stop all `hlbw-worker-warm-*` then spawn fresh via existing `pool-manager` logic; long-running so returns 202 Accepted with a job id.
  - `GET /api/scion/me` — returns `IapUser` from `getIapUser()` for the current-user chip.

- **Components / wiring**:
  - `IssueInbox` — add status filter pills (pending / in_progress / interrupted / needs_human / completed / failed / cancelled), free-text search on instruction substring, per-row actions (cancel / rerun / resume / resolve) gated by current status.
  - `IssueDetail` (NEW) — full Issue + last actor proposal + last critic findings (read from `MemoryEpisode kind:"decision"` history), plus Edit form for the PATCH route.
  - `WorkflowGraph` — add a "Force interrupt" button on running graphs (admin only — checks `me.role`).
  - `LiveWorkers` — per-row Logs / Kill / Restart buttons + a "Restart pool" header button.
  - `OperationsHeader` (NEW) — fires Heartbeat-Now and Watchdog-Now; shows last-fire timestamp + result.
  - `UserChip` (NEW) — current-user email + role; theme toggle (uses existing `next-themes` provider).
  - All actions use SWR `mutate` to refresh the relevant queries on success.

- **Hard rules**: write routes require admin role (assert via `getIapUser`). Destructive actions confirm-then-execute. No new schema. No new top-level deps.

- **Verifier extras**: per-route tests assert non-admin returns 403. Container smoke test: `curl -X POST http://localhost:3000/api/scion/heartbeat-now` returns 200/4xx (not 5xx).

### Pass 23 — config + analytics write paths
**Goal**: runtime knobs become editable; spend is breakable down by dimension; trace+memory get search.

- **New `RuntimeConfig` Prisma model** (one migration; user-gated per D5):
  - `key String @id`, `value Json`, `updatedAt DateTime @updatedAt`, `updatedBy String?`.
  - Keys: `category_provider_overrides`, `cycle_cap`, `confidence_threshold`, `exploration_budget`, `watchdog_timeout_minutes`. Loader `lib/orchestration/runtime-config.ts:getRuntimeConfig(key, fallbackEnv)` reads DB then falls back to env.

- **New write routes**:
  - `GET /api/scion/runtime-config` — returns all keys + effective values (DB ?? env ?? hardcoded default).
  - `PUT /api/scion/runtime-config/[key]` — admin-only, validated by per-key schema.
  - `GET /api/scion/budget?groupBy=task|model|day&from=&to=` — `BudgetLedger` aggregation.
  - `GET /api/scion/traces?status=&category=&from=&to=` — extends pass-18's route with filters.
  - `POST /api/scion/memory/search` — body `{ query, limit?, kind? }` → calls `embeddings.embed(query)` then `memory.queryBySimilarity`; returns top-k episodes.
  - `DELETE /api/scion/memory/[id]` — admin-only.
  - `GET /api/scion/mcp/[server]/tools` — opens the MCP server stdio just long enough to call `tools/list`, returns the catalog. Caches 60s.

- **Components**:
  - `RuntimeConfigPanel` — table editor; per-key form respecting type (string / number / json).
  - `BudgetBreakdown` — three small charts (per-task / per-model / per-day). Inline SVG bars; no charting library.
  - `TraceFilters` — date range + status + category pickers above the existing `TraceSidebar` list. Each row gets a "Open in Jaeger" link.
  - `MemorySearch` — text input + similarity results below the existing `MemoryBrowser`.
  - `MCPToolBrowser` — under Abilities tab; expand a server → list its tools.

- **Hard rules**: migration drafted via `--create-only` then ESCALATE. `runtime-config` writes audited (writer email + timestamp). Memory `DELETE` admin-only.

### Pass 24 — code-index seeder + niche capabilities
**Goal**: stop the symbol-index being empty; add the test/preview tools that round out the console.

- **Symbol seeder script** `scripts/seed-code-symbols.ts`:
  - Walks `app/`, `components/`, `lib/`, `scripts/` for `.ts/.tsx`.
  - Uses the AST analyzer MCP (existing `.agents/mcp-servers/ast-analyzer/`) to extract exported symbols.
  - For each symbol, embed `summary` via `EmbeddingProvider`, upsert into `MemoryEpisode kind:"entity"`.
  - Idempotent: skips symbols whose source hash hasn't changed.
  - CLI flags: `--paths a,b,c`, `--reembed`, `--dry-run`.

- **New write routes**:
  - `POST /api/scion/code-index/seed` — admin-only; spawns the seeder as a child process; returns 202 + a poll URL.
  - `GET /api/scion/code-index/seed/[jobId]` — returns progress (counts).
  - `POST /api/scion/embeddings/test` — body `{ text }` → returns `{ provider, dim, vector: number[12] }` (only first 12 elements for inspection).
  - `POST /api/scion/providers/test` — body `{ provider, prompt }` → runs a short generation, returns response + token usage. Capped at 200 tokens output.
  - `POST /api/scion/workflow/[id]/force-transition` — admin-only debug; force the graph to a named node. Audited.
  - `GET /api/scion/templates` — surfaces the existing `app/api/scion/templates/route.ts`.

- **Components**:
  - `CodeIndexPanel` — total indexed count, last seed run, "Re-seed" + "Re-embed all" buttons + progress.
  - `EmbeddingTester` — text input + vector preview.
  - `ProviderTester` — provider picker + prompt + result.
  - `TemplateBrowser` — list of templates; select to pre-fill `ExecuteDialog`.
  - `GraphDebugPanel` — admin-only; force-transition controls inside `WorkflowGraph`.

- **Hard rules**: seeder is incremental (source hash gate). All admin-only routes assert role. Provider tester output capped to prevent runaway cost.

---

## 7. Post-pass-20 protocol amendments

The §2 protocol applies to passes 21+ unchanged, plus these **UI-pass-specific** guards. The user re-raised hallucination and context-bloat concerns specifically for the chained passes 22–24 — the amendments below address them.

### 7.1 Component-grounding rule (extends §2.2 rule 2)
For every new component file:
- Before authoring, the Actor must `Read` the props interface (or function signature) of every other component / hook / route handler it consumes. Cite the file:line in the result artifact.
- Before final commit, every `<ChildComponent prop={...}>` usage is type-checked against the child's declared `Props`. `npm run test:types` is the ground truth.
- Critic verifies: pick 5 random `<Foo prop={x}>` JSX occurrences in the diff, Read `Foo`'s declared props, confirm `x`'s type matches.

### 7.2 CSS-grounding rule
- Every `className="some-class"` literal in a new TSX file MUST have a matching rule in `app/globals.css`.
- Critic Greps each cited class against `globals.css`. Missing rule → FAIL.
- Tailwind utility patterns continue to be banned in pass-scope files.

### 7.3 API-shape grounding rule
- Any UI fetcher (`useSWR`, `fetch`, `Invoke-RestMethod` patterns) must Read the corresponding `route.ts` to confirm the response shape it consumes.
- Type the SWR hook with the route's exported type alias (e.g. `useSWR<ConfigSnapshot>("/api/scion/config")`). Untyped fetchers FAIL.
- Critic verifies the route's `NextResponse.json(...)` body shape matches the consumer's expected type.

### 7.4 Build-must-pass gate (mandatory for UI passes)
- `npm run build` is part of the standard test gate for any pass touching `app/` or `components/`.
- A successful build catches a large class of UI hallucinations (missing exports, prop-type mismatches, server/client boundary violations).
- This was already in §2.2 rule 3 list; restating because UI passes were skipping it informally.

### 7.5 In-container smoke test (new — UI passes only)
- After the standard test gate, the dispatcher rebuilds the local container image, swaps `hlbw-hub-local`, and `curl`s every new route asserting non-5xx response.
- Smoke checklist appended to the pass result file.
- If a route is admin-gated, smoke includes the `LOCAL_TRUSTED_ADMIN=1` flag so the dispatcher can hit it.
- A 5xx during smoke → REWORK with the route's stack trace from `docker logs hlbw-hub-local --tail 50`.

### 7.6 Compression cadence amendment (extends §2.3)
Post-pass-20 the cadence continues:
- Every pass: write `pass-NN-verified.md` (≤300 words), discard `pass-NN-result.md` + `pass-NN-critic.md` from dispatcher working set after one verification read.
- **Compaction checkpoint at pass 25** (or at the conclusion of any post-20 sequence ≥3 passes — write `checkpoint-25.md` regardless).
- The dispatcher's working set for any post-20 pass NN is exactly: PLAN.md, critic-rubric.md, **most recent checkpoint** (currently `checkpoint-15.md` until 25 lands), `pass-{NN-1}-verified.md` (and any other post-checkpoint verified summaries since), the current pass spec from §6. **Hard cap: 5 documents.**

### 7.7 Dispatcher self-handoff trigger (extends §2.2 rule 5)
Specifically for chained passes 22→23→24:
- Between passes the dispatcher MUST drop the prior pass's result+critic+verified-text from in-conversation memory and re-load only the verified summary file.
- If the dispatcher's accumulated tool output for a single chain exceeds 35k tokens (raised from 20k for chained UI work), it writes `dispatcher-handoff.md` and asks the user to re-launch with a single instruction: "resume from pass-NN-verified.md per docs/re-arch/PLAN.md §6". A fresh dispatcher then continues.

### 7.8 UI-specific Critic checks (extends critic-rubric pass-NN-specific section)
Pass 22, 23, 24 Critics MUST additionally verify:
- **Admin-gating**: every write route in the pass that mutates state asserts `me.role === "ADMIN"` and returns 403 otherwise. Critic must invoke each route as both admin and non-admin and observe the difference.
- **Audit trail**: every state-mutating action writes a `MemoryEpisode kind:"decision"` row with the actor's email and the action payload (sanitized — no secrets).
- **Confirmations on destructive actions**: components issuing DELETE / cancel / kill / force-transition must show a confirmation prompt (component prop or `window.confirm`). Critic Greps the diff for these patterns.
- **No client-side secret use**: no `process.env.X` access from client components except `NEXT_PUBLIC_*`. Grep client files for `process.env.[A-Z_]+` and exclude `NEXT_PUBLIC_`.

### 7.9 Sequential dispatch order is enforced
Passes 22 → 23 → 24 must run sequentially. Pass 23 depends on pass-22 routes existing for `me.role` admin-gating consistency. Pass 24 depends on pass-23's `RuntimeConfig` being applied. Never dispatch in parallel.

### 7.10 Why this is enough (re-verification of safety against the user's concerns)
Two specific worries:
1. **Auto-compaction-driven definition loss**: addressed by §7.6's enforced per-pass write+drop cadence and the 5-document hard cap. The dispatcher never lets raw conversation grow past the next compaction trigger.
2. **Sloppiness / hallucination at scale**: addressed by §7.1–7.5 layering five additional grounding requirements on UI passes specifically (component, CSS, API-shape, build, smoke), plus §7.8's UI-specific Critic checks. Every claim is Grep-verifiable; every route is curl-verifiable; every component compiles or the gate fails.

**TURBO-ALL is now safe to invoke for the chain `pass 22 → 23 → 24`** because (a) each pass is verifiable in isolation, (b) the dispatcher's context never accumulates past the cap, (c) the Critic is a fresh adversarial agent per pass, (d) any failure stops the chain at that pass's REWORK cycle, never silently propagating.
