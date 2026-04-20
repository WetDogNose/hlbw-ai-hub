# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`hlbw-ai-hub` is the master orchestration / control plane for the HLBW ecosystem — not a conventional app repo. It hosts:

1. A Next.js 16 dashboard (`app/`, `components/`, `lib/`) — the operator UI (SCION) for the swarm.
2. A graph-orchestrated agent swarm (`scripts/swarm/` + `lib/orchestration/`) that dispatches isolated sub-agents in Docker containers and tracks them in Postgres.
3. The unified MCP server registry (`.gemini/mcp.json`, `.agents/mcp-servers/`, `scripts/mcp-*.mjs`) shared with sibling repos (`wot-box`, `genkit`, `adk-python`, `adk-js`) via [hlbw-ai-hub.code-workspace](hlbw-ai-hub.code-workspace).
4. GCP plumbing: Cloud Build → Cloud Run + Cloud SQL ([cloudbuild.yaml](cloudbuild.yaml)), Secret Manager sync ([scripts/create-secrets.ps1](scripts/create-secrets.ps1)).

Sibling app repos (notably `wot-box`) hold the actual business logic. Don't put product code here.

For the single-page architectural reference, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Common commands

| Task | Command |
| --- | --- |
| Dev server (runs `pre-flight` env check first) | `npm run dev` |
| Genkit dev (wraps `next dev`) | `npm run genkit:dev` |
| Production build | `npm run build` |
| Lint | `npm run lint` |
| Jest (excludes swarm tests, see below) | `npm test` |
| Single jest test | `npx jest path/to/file.test.ts -t "test name"` |
| Type-check **app** code | `npm run test:types` |
| Type-check **swarm** code (separate tsconfig) | `npm run test:swarm:types` |
| DB connectivity smoke test | `npm run test:db` |
| Security audit + secret scan | `npm run test:security` |
| Validate skills/workflows/MCP wiring | `npm run toolchain-doctor` |
| Refresh MCP servers | `npm run mcp:refresh` |
| Format | `npm run format` |
| Spellcheck | `npm run spellcheck` |
| Interactive setup (Ollama, deps, etc.) | `npm run bootstrap` |

`npm test` and the `test:*` scripts wrap their inner command in [scripts/memory-tracker.js](scripts/memory-tracker.js), which logs RSS — keep this wrapper when editing scripts.

## Two TypeScript projects

Two separate TS projects with different rules — touch the right one:

- **App** ([tsconfig.json](tsconfig.json)) — `app/`, `components/`, `lib/`, `src/`. Excludes `scripts/`.
- **Swarm/scripts** ([scripts/tsconfig.json](scripts/tsconfig.json)) — everything under `scripts/`. Different `module`/`moduleResolution`.

Jest excludes `scripts/swarm/__tests__/` ([jest.config.ts](jest.config.ts)); swarm unit tests run through `npm run test:swarm:types` and targeted `npx tsx` invocations. ESLint lints only `.ts`/`.tsx` ([eslint.config.mjs](eslint.config.mjs)).

## Orchestration architecture

Postgres is the source of truth. Every unit of work is an `Issue` (Prisma model); every in-flight graph run is a `TaskGraphState` row; every learned fact is a `MemoryEpisode` row (pgvector). There is no HTTP A2A, no JSON-file queue, no Neo4j write path — these have been retired.

### Roles — `scripts/swarm/roles/`

- [actor.ts](scripts/swarm/roles/actor.ts) — produces an `ActorProposal` given `ActorInput` + task + dynamic context window.
- [critic.ts](scripts/swarm/roles/critic.ts) — scores a proposal against a loaded `Rubric`. Receives only `CriticInput` (proposal + rubric); never sees Actor reasoning.
- [orchestrator.ts](scripts/swarm/roles/orchestrator.ts) — owns the StateGraph, routes between actor/critic, enforces the ≤3-cycle cap, records turn advantages.

### Graph runtime — `lib/orchestration/graph/`

- [StateGraph.ts](lib/orchestration/graph/StateGraph.ts) — `start` / `get` / `transition` / `resume` / `interrupt`. Each transition is atomic (`prisma.$transaction` + `SELECT … FOR UPDATE`).
- `Node` / `NodeOutcome` / `GraphContext` / `defineGraph` — in-house JS StateGraph; no LangGraph dep.
- Topology of the agent runner graph (defined in [scripts/swarm/runner/nodes.ts](scripts/swarm/runner/nodes.ts)):
  `init_mcp → build_context → explore → propose_plan → execute_step ⇄ record_observation ⇄ evaluate_completion → commit_or_loop`.

### Dispatcher — one-shot CLI dispatch

- [`/api/orchestrator/heartbeat`](app/api/orchestrator/heartbeat/route.ts) calls [lib/orchestration/dispatcher.ts](lib/orchestration/dispatcher.ts) which claims ready Issues with `SELECT … FOR UPDATE SKIP LOCKED` and spawns a detached `docker-worker` child per Issue.
- [scripts/swarm/docker-worker.ts](scripts/swarm/docker-worker.ts) launches the container per task; [scripts/swarm/agent-runner.ts](scripts/swarm/agent-runner.ts) is the in-container one-shot entry point.
- [scripts/swarm/resume-worker.ts](scripts/swarm/resume-worker.ts) resumes paused workers from the last persisted graph node.
- [scripts/swarm/watchdog.ts](scripts/swarm/watchdog.ts) marks stale workers `paused` — never loses `TaskGraphState`.

### Rubric registry — `lib/orchestration/rubrics/`

`loadRubric(category)` dispatches to per-category rubrics: `1_qa`, `2_source_control`, `3_cloud`, `4_db`, `5_bizops`, `default`. Each rubric has named checks plus a confidence-score threshold (default ≥0.85).

### Dynamic context window — `lib/orchestration/context-builder.ts`

`buildDynamicContext(input, deps)` replaces the static "dump every MCP tool" path. Input = task + category; deps = `MemoryStore`, `CodeIndex`, `EmbeddingProvider`, optional trace summaries. Output is a token-budgeted window packed by relevance density: rubric → top-k memory → top-k code symbols → tool catalogue (compacts under pressure) → optional trace summaries → task instruction LAST.

### Memory + code index + embeddings — `lib/orchestration/{memory,code-index,embeddings}/`

- [MemoryStore.ts](lib/orchestration/memory/MemoryStore.ts) — `MemoryEpisode`, `WriteEpisodeInput`, similarity query contract.
- [PgvectorMemoryStore.ts](lib/orchestration/memory/PgvectorMemoryStore.ts) — the sole write path. `memory_episode` table with `vector(768)`.
- [Neo4jReadAdapter.ts](lib/orchestration/memory/Neo4jReadAdapter.ts) — read-only deprecated adapter. No writers in live code.
- [code-index.ts](lib/orchestration/code-index.ts) + [code-index/PgvectorCodeIndex.ts](lib/orchestration/code-index/PgvectorCodeIndex.ts) — symbols stored in `memory_episode` with `kind: "entity"` (no schema branch).
- `EmbeddingProvider` — `VertexEmbeddingProvider` when `GEMINI_API_KEY` is set, else `StubEmbeddingProvider`. Singleton per process.

### Observability — `lib/orchestration/tracing/`

Every node transition emits an OTEL span. Attribute keys come from [attrs.ts](lib/orchestration/tracing/attrs.ts) (`SPAN_ATTR.{TASK_ID,ROLE,NODE,MODEL_ID,PROVIDER,…}`). Recent-trace summaries feed the context builder via [summaries.ts](lib/orchestration/tracing/summaries.ts) (`fetchRecentTraceSummaries`). Spans flow to Jaeger (local) or Cloud Trace (prod). `/api/orchestrator/stream` emits real SSE off the OTEL stream keyed on `taskId`.

### Turn-PPO seam — `lib/rl/`

- [types.ts](lib/rl/types.ts) — `TurnCritic` interface (`recordTurn` / `estimateValue` / `computeAdvantage` / `flush`), `TurnSnapshot`, `TurnAdvantage`.
- [NoopTurnCritic.ts](lib/rl/NoopTurnCritic.ts) — default impl; writes turn snapshots to `MemoryStore` with `kind: "entity"`. No training code.
- [index.ts](lib/rl/index.ts) — `getTurnCritic()` singleton; `TURN_CRITIC` env var reserved for a future `PpoTurnCritic`.

## SCION UI

- [components/scion-dashboard.tsx](components/scion-dashboard.tsx) + [components/orchestration/*.tsx](components/orchestration/) — SWR off the unified Issue/TaskGraphState model.
- API routes: `GET /api/scion/state`, `POST /api/scion/execute`, `GET /api/scion/issue/[id]`, `GET /api/scion/traces`, `GET /api/orchestrator/stream`, `POST /api/orchestrator/heartbeat`.
- `BudgetLedger` accumulates real per-task spend from `providers.ts` token usage.

## Conventions that are easy to miss

- **Vanilla CSS only.** No Tailwind utility classes (`p-4`, `flex-col`, etc.) in `app/` or `components/`. All styles live in [app/globals.css](app/globals.css) with semantic class names + theme variables (`var(--bg-primary)`, `var(--shadow-md)`). Tailwind is stripped from the CSS pipeline; utility classes render unstyled. Residual Tailwind in 14 admin/settings/thread files is tracked in [docs/re-arch/tailwind-migration-queue.md](docs/re-arch/tailwind-migration-queue.md).
- **Directory hygiene.** Never write to repo root. Logs → `logs/`, scratch/temp → `tmp/`, docs → `docs/` or `.agents/`. Re-arch artifacts go under `docs/re-arch/`.
- **GCP region is `asia-southeast1`.** All Cloud Run / Cloud SQL deploys target this region — see the directive at the top of [cloudbuild.yaml](cloudbuild.yaml). Never `us-central1` without explicit user instruction.
- **New agents/MCP servers use the wrappers.** Start from [wrappers/a2a/](wrappers/a2a/) (Python) or [wrappers/mcp/](wrappers/mcp/) (Node), then drop into `templates/docker/` or `templates/cloud-run/`. See [.agents/workflows/scaffold-agent.md](.agents/workflows/scaffold-agent.md) and [.agents/workflows/scaffold-mcp.md](.agents/workflows/scaffold-mcp.md).
- **Jest imports** use `import { ... } from '@jest/globals'` (not the global `describe`/`it`).
- **Raw SQL** goes through `Prisma.sql`. No string concatenation.
- **`lib/` does not import from `scripts/`.** The tsconfig split enforces this; re-exports go through `@/scripts/...` path alias only where Next + jest resolve it.
- **MCP server registry.** The authoritative list is [.gemini/mcp.json](.gemini/mcp.json). Custom servers live under [.agents/mcp-servers/](.agents/mcp-servers/) and [scripts/mcp-*.mjs](scripts/).
- **Pre-flight env check.** `npm run dev` runs [scripts/pre-flight.js](scripts/pre-flight.js), which fails if `.env` is missing keys from `.env.example`. Update both together.
- **Prisma migrations are user-gated.** Schema changes draft the migration SQL but never run `prisma migrate deploy` autonomously. The user runs migrations.
- **Husky pre-commit** runs lint-staged (eslint --fix + prettier) on staged `.{js,jsx,ts,tsx}`.

## Authoritative agent directives in `.cursorrules` / `.geminirules`

These files contain three layered policies, all authoritative:

1. **Vanilla CSS rule** (top of both files) — see Conventions above.
2. **Flash Mode / Hardware Saturation** (`.geminirules` only) — when invoked, prefer batch tools (`delegate_batch_code_edit`), prefer the AST analyzer over raw file reads, parallelize independent tool calls, keep `sequential-thinking` to ≤3 turns.
3. **`[SYSTEM DIRECTIVE FOR HARNESS-REFACTORING AGENT]`** — the four Q1 2026 architectural standards, now implemented in this repo: (a) stateful graph orchestration via `lib/orchestration/graph/`, (b) test-time interaction scaling via `lib/orchestration/explorer.ts`, (c) Actor/Critic/Orchestrator role separation in `scripts/swarm/roles/`, (d) Turn-PPO seam in `lib/rl/`. These are non-negotiable for any new harness work. The re-arch plan that implemented them is [docs/re-arch/PLAN.md](docs/re-arch/PLAN.md).

## Reference docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — single-page architectural reference.
- [README.md](README.md) — high-level mission.
- [docs/GEMINI.md](docs/GEMINI.md) — operating manual for AI agents in this hub.
- [docs/GCP-DEPLOYMENT.md](docs/GCP-DEPLOYMENT.md) — Cloud architecture / pipeline.
- [docs/v3-swarming-model-architecture.md](docs/v3-swarming-model-architecture.md) — swarm system map (legacy; ARCHITECTURE.md supersedes).
- [docs/re-arch/](docs/re-arch/) — the 20-pass re-architecture plan + per-pass verified summaries + checkpoints.
