# Pass 1 — Inventory

Single source-of-truth map of every subsystem in `c:/Users/Jason/repos/hlbw-ai-hub/`. Every row is backed by a Read or Grep performed in Pass 1. "Live?" is derived from: imported by another live file, referenced by `package.json` scripts, or referenced by `Dockerfile` / `cloudbuild.yaml` / `.github/workflows/*`. A file is a **dead-code candidate** when no live inbound ref exists.

---

## A. Home-grown swarm — `scripts/swarm/`

| Path | Role | Inbound deps | Outbound deps | Live? |
|---|---|---|---|---|
| `scripts/swarm/types.ts` | Task / Worker / SwarmState enums and type aliases | `arbiter.ts`, `state-manager.ts`, `delegate.ts`, `docker-worker.ts`, `watchdog.ts`, `demo-traces.ts`, `__tests__/arbiter.test.ts`, `__tests__/state.test.ts` | (none) | Live |
| `scripts/swarm/policy.ts` | `SWARM_POLICY` constant (capacity, retention, limits) | `state-manager.ts`, `delegate.ts`, `manage-worktree.ts`, `docker-worker.ts`, `watchdog.ts`, `pool-manager.ts`, `demo-traces.ts` | (none) | Live |
| `scripts/swarm/tracing.ts` | OTEL NodeSDK bootstrap; `startTracing`/`stopTracing`/`getTracer` | `arbiter.ts`, `agent-runner.ts`, `delegate.ts`, `providers.ts`, `shared-memory.ts`, `manage-worktree.ts`, `docker-worker.ts`, `watchdog.ts`, `pool-manager.ts`, `demo-traces.ts`, `hardware-max-stress.ts`, `test-swarm-concurrency.ts` | `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/sdk-trace-node`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`, `@opentelemetry/api` | Live |
| `scripts/swarm/audit.ts` | `appendAudit` WebSocket+file audit log | `shared-memory.ts`, `docker-worker.ts`, `state-manager.ts`, `manage-worktree.ts`, `watchdog.ts`, `demo-traces.ts`, `delegate.ts` | `ws`, `node:fs` | Live |
| `scripts/swarm/state-manager.ts` | JSON swarm state file CRUD (`addTask`, `assignTask`, `addWorker`, `getState`) | `arbiter.ts`, `delegate.ts`, `__tests__/arbiter.test.ts`, `__tests__/state.test.ts` | `node:fs/promises`, `proper-lockfile`, `node:crypto`, `./types`, `./policy`, `./audit` | Live |
| `scripts/swarm/arbiter.ts` | `getNextAvailableTask` priority-ordered read from JSON | `watchdog.ts`, `demo-traces.ts`, `__tests__/arbiter.test.ts` | `./state-manager`, `./types`, `./tracing` | Live |
| `scripts/swarm/delegate.ts` | CLI task/worker enqueue helper (`addTask`, `assignTask`) | (none found) | `./state-manager`, `./manage-worktree`, `./types`, `./policy`, `./tracing`, `./audit`, `./shared-memory` | Dead-code candidate |
| `scripts/swarm/providers.ts` | `Provider` adapter contract + Gemini/Ollama impls; `GenerationRequest` | `__tests__/provider-contract.test.ts` | `./tracing` | Live (tests only) |
| `scripts/swarm/manage-worktree.ts` | Git-worktree lifecycle (`createWorktree`, `removeWorktree`, `listWorktrees`) | `delegate.ts`, `docker-worker.ts`, `watchdog.ts` | `node:child_process`, `./tracing`, `./policy`, `./audit` | Live |
| `scripts/swarm/shared-memory.ts` | Neo4j memory: `shareTaskContext`, `shareDiscovery`, `shareDecision`, `markTaskComplete`, `storeEntity`, `addObservations`, `createRelation`, `closeMemoryClient`, `getSharedContext` | `agent-runner.ts`, `delegate.ts`, `watchdog.ts`, `demo-memory-full.ts`, `test-memory-monitor.ts` | `neo4j-driver`, `./tracing`, `./audit` | Live |
| `scripts/swarm/docker-worker.ts` | Host-side `spawnDockerWorker`, `spawnBatch`, `waitForWorker`, `getWorkerLogs`, `updateTaskStatus` | `hardware-max-stress.ts`, `test-swarm-concurrency.ts`, `test-dispatcher.ts`, `scratch/dispatch-cloud-agent.ts` | `dotenv`, `./types`, `./manage-worktree`, `./tracing`, `./policy`, `./audit` | Live |
| `scripts/swarm/agent-runner.ts` | In-container Gemini chat loop; boots MCP clients and dumps every tool into the chat | `pool-manager.ts` (via `command` array), `demo-workers.mjs` (via `command` array) | `@google/generative-ai`, `@opentelemetry/api`, `@modelcontextprotocol/sdk`, `./tracing`, `./shared-memory` | Live |
| `scripts/swarm/pool-manager.ts` | Warm-pool V3 agent runner spawning via `docker run` | `start-here.ps1:184` (`npx tsx scripts/swarm/pool-manager.ts start 21`) | `dotenv`, `@modelcontextprotocol/sdk`, `./policy` | Live |
| `scripts/swarm/watchdog.ts` | Scan stale workers; kill and clean worktrees | `.agents/workflows/master-agent-coordinator.md:49` (`npx tsx scripts/swarm/watchdog.ts`) | `./types`, `./manage-worktree`, `@modelcontextprotocol/sdk`, `./tracing`, `./policy`, `./audit`, `./arbiter`, `./shared-memory` | Live |
| `scripts/swarm/node-a2a-master.ts` | Spawn python A2A worker child process | (none) | `child_process`, `path` | Dead-code candidate |
| `scripts/swarm/python-a2a-worker.py` | HTTPServer A2A worker stub | `node-a2a-master.ts` spawns, `demo-workers.mjs` references in `command` | stdlib http/json/threading/asyncio | Live (via demo) |
| `scripts/swarm/python-runner.py` | Python agent-runner entry; calls `google.genai` with OTEL | (no TS importer; referenced by `Dockerfile.python-worker`) | `google.genai`, `opentelemetry`, `otel_setup` | Live (via `Dockerfile.python-worker`) |
| `scripts/swarm/audit.ts` | (covered above) | — | — | Live |
| `scripts/swarm/test-swarm-concurrency.ts` | Manual concurrency exerciser | (none) | `./docker-worker`, `./tracing` | Dead-code candidate |
| `scripts/swarm/test-dispatcher.ts` | Manual dispatch smoke script | (none) | `./docker-worker` | Dead-code candidate |
| `scripts/swarm/test-memory-monitor.ts` | Manual Neo4j memory exerciser | (none) | `./shared-memory` | Dead-code candidate |
| `scripts/swarm/hardware-max-stress.ts` | Manual stress script | (none) | `./docker-worker`, `./tracing` | Dead-code candidate |
| `scripts/swarm/start-trace-viewer.ts` | Launches local jaeger | (none) | `node:child_process` | Dead-code candidate |
| `scripts/swarm/demo-traces.ts` | Example trace-emitter | (none) | `./tracing`, `./state-manager`, `./arbiter`, `./types`, `./audit`, `./policy` | Dead-code candidate |
| `scripts/swarm/demo-memory-full.ts` | Example memory client | (none) | `./shared-memory` | Dead-code candidate |
| `scripts/swarm/demo-workers.mjs` | Example warm-pool spawner | (none) | `dotenv`, `@modelcontextprotocol/sdk` | Dead-code candidate |
| `scripts/swarm/reduce-chunks.ts` | Unused chunk reducer utility | (none) | `fs/promises`, `path` | Dead-code candidate |
| `scripts/swarm/docker_exec_proxy.js` | `docker exec` subprocess wrapper (referenced only in CLAUDE.md prose and `demo-traces.ts` string) | (none, only prose) | `child_process`, `fs` | Dead-code candidate |
| `scripts/swarm/Dockerfile.swarm-worker` | Worker container image (TS runtime) | `build-swarm-worker.sh`, `scripts/turbo/turbo-swarm-worker.ps1` | — | Live (build script) |
| `scripts/swarm/Dockerfile.python-worker` | Worker container image (python runtime) | `build-python-worker.sh` | — | Live (build script) |
| `scripts/swarm/build-swarm-worker.sh` | Build helper for TS worker image | (not wired to `package.json`) | — | Dead-code candidate |
| `scripts/swarm/build-python-worker.sh` | Build helper for python worker image | (not wired to `package.json`) | — | Dead-code candidate |
| `scripts/swarm/requirements.txt` | Python deps for python-runner / python-a2a-worker | `Dockerfile.python-worker` | — | Live |
| `scripts/swarm/__tests__/arbiter.test.ts` | Jest tests for `arbiter.ts` | — | `../arbiter`, `../state-manager`, `../types`, `vitest` | Live (but imports `vitest` which is not a dep — see Open issues) |
| `scripts/swarm/__tests__/state.test.ts` | Jest tests for `state-manager.ts` | — | `../state-manager`, `../types`, `vitest` | Live (same vitest issue) |
| `scripts/swarm/__tests__/provider-contract.test.ts` | Provider-contract jest test | — | `../providers` | Live |

Notes (backed by Grep):
- Dead-code verification Grep scope (rework cycle 1 — broadened): every candidate's bare filename (minus extension) was Grepped across the whole repo excluding `node_modules`, covering `.ts`/`.tsx`/`.mjs`/`.js` imports, **plus** `*.ps1`/`*.sh`/`*.cmd`/`*.bat` at repo root and under `scripts/`, `Dockerfile*` under any path, `cloudbuild.yaml`, every `.github/workflows/*.yml|.toml`, `package.json` scripts, `.gemini/mcp.json`, `tools/docker-gemini-cli/configs/**/mcp_config.json`, and `.agents/skills/*/SKILL.md` + `.agents/workflows/*.md` for inline `npx tsx <script>` commands.
- `node-a2a-master.ts`, `delegate.ts` have zero inbound `from ".*<basename>"` or `require(".*<basename>")` imports across the tree, and zero executable invocations in any `.ps1`/`.sh`/`.cmd`/`.bat`/Dockerfile/`cloudbuild.yaml`/`.github/workflows/*`/`package.json` script/MCP config/workflow-or-skill markdown.
- `pool-manager.ts` is invoked by `start-here.ps1:184` (`npx tsx scripts/swarm/pool-manager.ts start 21`) — Live.
- `watchdog.ts` is invoked by `.agents/workflows/master-agent-coordinator.md:49` (`npx tsx scripts/swarm/watchdog.ts`) — same live-invocation criterion the inventory uses for `docker-worker.ts`. Live.
- `scripts/mcp-dynamic-postgres.mjs` is wired in `tools/docker-gemini-cli/configs/category-4-db/mcp_config.json:6` as an active MCP server command — Live.
- `.agents/mcp-servers/infrastructure-analyzer/dist/index.js` is wired in `tools/docker-gemini-cli/configs/category-1-qa/mcp_config.json:12` and verified by `scripts/toolchain-doctor.js:293` — Live.
- `agent-runner.ts` is invoked as a container entry via string `command` arrays in `pool-manager.ts:95` and `scripts/swarm/demo-workers.mjs:66`. Transitive live chain: `start-here.ps1:184` → `pool-manager.ts:95` → `agent-runner.ts`. Additionally Live via the `Dockerfile.swarm-worker` build path and the explicit `npx tsx scripts/swarm/docker-worker.ts` CLI documented in `.agents/skills/*`.
- `docker-worker.ts` is invoked directly via `npx tsx` per `docs/features/hub-and-spoke-swarm.md:54`, `.agents/workflows/master-agent-coordinator.md:33`, and several SKILL.md files; verified via Grep.

---

## B. SCION subsystem

### B.1 API routes

| Path | Role | Inbound deps | Outbound deps | Live? |
|---|---|---|---|---|
| `app/api/scion/execute/route.ts` | `POST` creates `Thread` + `Issue`, rejects on ledger budget >5M tokens | Next.js route registry | `next/server`, `@/lib/prisma` | Live (Next.js route) |
| `app/api/scion/templates/route.ts` | `GET`/`POST` template YAML files under `../ai-organisation-engine/.scion/templates` (sibling repo) | Next.js route registry | `next/server`, `node:fs/promises`, `node:path` | Live (Next.js route) |
| `app/api/orchestrator/heartbeat/route.ts` | `POST` scans `Routine` active + `Issue.status=IN_PROGRESS`; returns counts only | Next.js route registry | `next/server`, `@/lib/prisma` | Live (Next.js route) |
| `app/api/orchestrator/stream/route.ts` | `GET` emits 15 synthetic SSE debug lines then closes | Next.js route registry | `next/server` | Live (Next.js route) |
| `app/admin/scion/page.tsx` | Admin page wrapping `ScionDashboard` | Next.js app-router | `@/components/scion-dashboard` | Live |

### B.2 Components

| Path | Role | Inbound deps | Outbound deps | Live? |
|---|---|---|---|---|
| `components/scion-dashboard.tsx` | Client component; grid of orchestration widgets | `app/admin/scion/page.tsx` | `react`, `lucide-react`, `next/link`, `./orchestration/TopographyTree`, `./orchestration/GlobalLedger`, `./orchestration/GoalTracker`, `./orchestration/IssueInbox` | Live |
| `components/orchestration/TopographyTree.tsx` | Static topology tree widget | `scion-dashboard.tsx` | `react`, `lucide-react` | Live |
| `components/orchestration/GlobalLedger.tsx` | Static ledger widget | `scion-dashboard.tsx` | `react`, `lucide-react` | Live |
| `components/orchestration/GoalTracker.tsx` | Static goal widget | `scion-dashboard.tsx` | `react`, `lucide-react` | Live |
| `components/orchestration/IssueInbox.tsx` | Static issue list widget | `scion-dashboard.tsx` | `react`, `lucide-react`, `next/link` | Live |

### B.3 Lib

| Path | Role | Inbound deps | Outbound deps | Live? |
|---|---|---|---|---|
| `lib/orchestration/db-sync.ts` | `lockIssueForWorkload`, `unlockIssue` — Prisma update helpers | (Grep scope: whole repo; zero inbound refs) | `@/lib/prisma` | Dead-code candidate |

All scion/orchestration components use Tailwind utility classes (`flex flex-col gap-8 p-8 …`) — verified at `components/scion-dashboard.tsx:15`. This contradicts the vanilla-CSS rule and is explicitly targeted by Pass 3.

---

## C. Paperclip

| Path | Role | Inbound deps | Outbound deps | Live? |
|---|---|---|---|---|
| `tools/docker-paperclip/Dockerfile` | Container with `paperclipai`, `aider-chat`, `@anthropic-ai/claude-code`, LiteLLM proxy; listens on 3100/3101 via socat | `start-here.ps1:115-135` (`docker build -t hlbw-paperclip .`) | — | Live (via `start-here.ps1`) |

Callers found (`Grep "paperclip" -i`):
- `start-here.ps1:115-135` — builds and runs `hlbw-paperclip` container.
- `prisma/schema.prisma:147` — comment header `--- Paperclip.ing Orchestration Models ---`.
- `app/api/scion/execute/route.ts:12` — comment referencing "Paperclip Compliance check".
- `docs/dev-state-stage-*.md` — prose only.

No code in `scripts/swarm/`, `lib/`, `app/api/` imports from or invokes `tools/docker-paperclip/` beyond the `start-here.ps1` bootstrap.

---

## D. MCP servers

### D.1 `.gemini/mcp.json`

| Server | Command | Target binary exists? |
|---|---|---|
| `task-delegator-mcp` | `node .agents/mcp-servers/task-delegator/dist/index.js` | Yes (file present) |
| `ast-analyzer-mcp` | `node .agents/mcp-servers/ast-analyzer/dist/index.js` | Yes (file present) |
| `memory` | `npx -y @modelcontextprotocol/server-memory` | External npm package |
| `sequential-thinking` | `npx -y @modelcontextprotocol/server-sequential-thinking` | External npm package |
| `docker-mcp-gateway` | `docker mcp gateway run` | External docker CLI |
| `docker-manager-mcp` | `node .agents/mcp-servers/docker-manager-mcp/build/index.js` | Yes (file present) |
| `gcp-trace-mcp` | `node scripts/mcp-trace-server.mjs` | Yes (file present) |
| `home-assistant` | `node scripts/ha-mcp-proxy.mjs http://192.168.3.88:9583/private_RvWR4HFYPGmhm9Tc2Uxuuw/sse` | Yes (file present) |

### D.2 `.agents/mcp-servers/*`

| Path | Role | Source entry | Built binary |
|---|---|---|---|
| `.agents/mcp-servers/ast-analyzer/` | AST/TS symbol analyzer MCP server | `src/index.ts` | `dist/index.js` (exists) |
| `.agents/mcp-servers/docker-manager-mcp/` | Docker container manager MCP server | `src/index.ts` | `build/index.js` (exists) |
| `.agents/mcp-servers/infrastructure-analyzer/` | Infrastructure analyzer MCP server | `src/index.ts` | `dist/index.js` (exists); wired in `tools/docker-gemini-cli/configs/category-1-qa/mcp_config.json:12` and verified by `scripts/toolchain-doctor.js:293`. Live. |
| `.agents/mcp-servers/task-delegator/` | Task-delegation MCP server | `src/index.ts` | `dist/index.js` (exists) |

### D.3 `scripts/mcp-*.mjs`

| Path | Role | Wired in? |
|---|---|---|
| `scripts/mcp-wrapper.mjs` | Generic MCP wrapper script | Grep scope: not referenced by `.gemini/mcp.json`, `package.json`, `Dockerfile`, `cloudbuild.yaml`, or `.github/workflows/*`. Dead-code candidate. |
| `scripts/mcp-dynamic-postgres.mjs` | Dynamic Postgres MCP shim | Wired in `tools/docker-gemini-cli/configs/category-4-db/mcp_config.json:6` as an active MCP server command. Live. |
| `scripts/mcp-tester.mjs` | MCP testing harness | `package.json:mcp:testing` → `node scripts/mcp-tester.mjs`. Live. |
| `scripts/mcp-logging-server.mjs` | Logging MCP server | `package.json:mcp:logging` → `node scripts/mcp-logging-server.mjs`. Live. |
| `scripts/mcp-trace-server.mjs` | GCP trace MCP server | `.gemini/mcp.json` → `gcp-trace-mcp`. Live. |
| `scripts/ha-mcp-proxy.mjs` | Home-Assistant SSE→stdio proxy | `.gemini/mcp.json` → `home-assistant`. Live. |

---

## E. Wrappers and templates

### E.1 Wrappers

| Path | Role | Live? |
|---|---|---|
| `wrappers/a2a/main.py` | FastAPI A2A wrapper stub | Not imported by any code in `hlbw-ai-hub/`. Referenced by docs and `.agents/workers/directive-enforcer/main.py` only. Reference-only. |
| `wrappers/a2a/otel_setup.py` | OTEL init helper for A2A | Peer of `main.py`. Reference-only. |
| `wrappers/a2a/requirements.txt` | Python deps list | Reference-only. |
| `wrappers/mcp/index.js` | Generic MCP server wrapper stub | Reference-only (docs-documented). |
| `wrappers/mcp/otelSetup.js` | OTEL init helper for MCP | Peer of `index.js`. Reference-only. |
| `wrappers/mcp/package.json` | Deps list for wrapper | Reference-only. |

### E.2 Templates

| Path | Role | Live? |
|---|---|---|
| `templates/docker/node/{Dockerfile,index.js,otelSetup.js,package.json}` | Node docker template | Reference only (docs-linked). |
| `templates/docker/python/{Dockerfile,main.py,otel_setup.py,requirements.txt}` | Python docker template | Reference only. |
| `templates/cloud-run/node/{Dockerfile,index.js,otelSetup.js,package.json}` | Node Cloud Run template | Reference only. |
| `templates/cloud-run/python/{Dockerfile,main.py,otel_setup.py,requirements.txt}` | Python Cloud Run template | Reference only. |
| `templates/pipelines/github-actions/ci-validation.yml` | GH Actions CI template | Reference only. |
| `templates/pipelines/github-actions/deploy-cloud-run.yml` | GH Actions deploy template | Reference only. |
| `templates/pipelines/github-actions/docker-build-test.yml` | GH Actions docker build template | Reference only. |
| `templates/pipelines/local/run-local.sh` | Local run helper | Reference only. |
| `templates/adk-chat-interface/{otelSetup.js,package.json,server.js,public/index.html}` | ADK chat UI template | Reference only. |

All templates are reference blueprints; zero imports from repo runtime code. Live-for-template-purposes only.

---

## F. Skills and workflows

### F.1 Skills (`.agents/skills/*/SKILL.md`)

| Skill | One-line purpose (from `description:` frontmatter or first line) |
|---|---|
| `bootstrap-environment` | Autonomously bootstraps the development environment, installing dependencies and logging into external services. |
| `app-tester` | Maps code modifications to validation layers and executes `wot-box-tester` suites via MCP. |
| `cli-turbo-overrides` | Enforces safe read-only CLI commands run headlessly without user confirmation. |
| `containerized-gemini-cli` | Rules for building and running the Gemini CLI docker environment. |
| `coverage-reporter` | Generates comprehensive test coverage reports and publishes them to the log folder. |
| `directive-enforcer` | A2A worker that audits/enforces Markdown-callout-based agent instructions. |
| `directive-enforcer-sentry` | Global sentry skill to validate draft instructions against workspace context. |
| `example-skill` | Example scaffold demonstrating skill structure. |
| `feature-replication-exporter` | Exports toolchain features as blueprints + starter templates. |
| `home-assistant` | Bridges local HA config repo with the live HA instance via the `7_automation` MCP sub-agent. |
| `mcp-optimizations` | Directs the agent to prefer high-speed MCP tools over filesystem tools. |
| `mcp-server-recommender` | Checks MCP registry and recommends new servers for the stack. |
| `memory-analyzer` | Analyzes memory-tracker logs for leaks/runaway processes. |
| `production-db-triage` | Safely inspect and query the production DB via `4_db` MCP sub-agent. |
| `repo-cleaner` | Purges temp files, old logs, and test outputs. |
| `test-image-downloader` | Downloads real photos of storage containers for pipeline testing. |
| `toolchain-documenter` | Regenerates the Wot-Box Toolchain Capabilities Reference document. |
| `toolchain-doctor` | Self-healing diagnostic skill for the toolchain. |

### F.2 Workflows (`.agents/workflows/*.md`)

| Workflow | One-line purpose (from first heading / prose) |
|---|---|
| `deploy-with-version.md` | Deployment workflow with version-stamping pre-flight and swarm delegation. |
| `gcp-schema-migration.md` | GCP schema migration procedure. |
| `master-agent-coordinator.md` | Master Agent Coordinator workflow orchestrating the swarm. |
| `scaffold-agent.md` | Scaffolds a base agent with A2A wrapper + logistics. |
| `scaffold-api-route.md` | Scaffolds a new Next.js API route. |
| `scaffold-component.md` | Scaffolds a new React component. |
| `scaffold-mcp.md` | Scaffolds a new MCP server with the MCP wrapper. |
| `ui-button-typography-standards.md` | UI button and typography standards. |
| `ui-modal-standards.md` | UI modal standards (backdrop, card, header, body, footer). |

---

## G. Prisma model (`prisma/schema.prisma`)

| Model | One-line purpose | Touched by |
|---|---|---|
| `Account` | NextAuth OAuth account linkage | Neither |
| `Session` | NextAuth session | Neither |
| `User` | NextAuth user + role flags | Neither |
| `VerificationToken` | NextAuth email verification | Neither |
| `AISetting` | Pipeline/stage prompt settings | Neither |
| `AppearanceSetting` | UI theme variables | Neither |
| `SystemSetting` | System-wide flags (auto-approve etc.) | Neither |
| `Organization` | Org wrapper for personas + goals | SCION |
| `AgentPersona` | SCION agent definition (status, role, issues, ledgers) | SCION |
| `Goal` | Org-level goal grouping issues | SCION |
| `Thread` | Conversation thread grouping issues | SCION (created by `/api/scion/execute`) |
| `Issue` | Unit of work; status lifecycle OPEN→IN_PROGRESS→PAUSED→COMPLETED→BLOCKED | SCION (`execute`, `heartbeat`, `lib/orchestration/db-sync.ts`) |
| `IssueRelation` | Parent/child issue dependency graph | SCION |
| `Routine` | Cron-expression scheduled task payload | SCION (`heartbeat`) |
| `BudgetLedger` | Per-agent token spend + cost | SCION (`execute` budget gate) |
| `WebhookConfig` | Outbound webhook registration | Neither |

Neither the swarm state (JSON in `.agents/swarm/state.json`) nor `scripts/swarm/types.ts`'s `Task`/`Worker`/`SwarmState` are represented in Prisma.

---

## H. Top-level cruft (repo root)

Excluded: `.git`, `node_modules`, `.next`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.tsbuildinfo`.

| File/dir | Type | Recommendation |
|---|---|---|
| `.agents/` | Config (agent toolchain) | Keep |
| `.cursorrules` | Config (editor) | Keep |
| `.dockerignore` | Config | Keep |
| `.env` | Config (secrets; should be in `.gitignore`) | Keep (verify in `.gitignore`) |
| `.env.example` | Config | Keep |
| `.gemini/` | Config (MCP + rules) | Keep |
| `.geminirules` | Config | Keep |
| `.github/` | Config (CI workflows) | Keep |
| `.gitignore` | Config | Keep |
| `.husky/` | Config (git hooks) | Keep |
| `.secretlintignore` | Config | Keep |
| `.secretlintrc.json` | Config | Keep |
| `.venv/` | Build artifact (python venv) | Delete candidate |
| `.vscode/` | Config | Keep |
| `CLAUDE.md` | Doc | Keep |
| `Dockerfile` | Config | Keep |
| `README.md` | Doc | Keep |
| `app/` | Source | Keep |
| `build_log.txt` | Build artifact | Delete candidate |
| `cloudbuild.yaml` | Config | Keep (frozen until Pass 20) |
| `components/` | Source | Keep |
| `docs/` | Doc | Keep |
| `eslint.config.mjs` | Config | Keep |
| `exports/` | Doc/artifact export dir | Keep (referenced by `feature-replication-exporter` skill) |
| `hlbw-ai-hub.code-workspace` | Config (VSCode workspace) | Keep |
| `jest.config.ts` | Config | Keep |
| `lib/` | Source | Keep |
| `log3.txt` | Build artifact (stale log) | Delete candidate |
| `logs/` | Build artifact dir (memory-tracker logs) | Keep dir; contents are artifacts |
| `logs-cloud-2.txt` | Build artifact | Delete candidate |
| `logs.txt` | Build artifact | Delete candidate |
| `next-env.d.ts` | Config (auto-generated) | Keep |
| `next.config.ts` | Config | Keep |
| `prisma/` | Source/schema | Keep |
| `public/` | Source (static assets) | Keep |
| `scratch/` | Dev-scratch (contains `dispatch-cloud-agent.ts` which imports swarm) | Move to docs or delete; per Pass 20 hard rule 2.2, no new files at repo root, but existing ones are candidates for relocation |
| `scripts/` | Source | Keep |
| `src/` | Source (Genkit sample?) | Confirm contents before Pass 20 cull |
| `start-here.ps1` | Dev bootstrap script | Keep |
| `templates/` | Source (reference templates) | Keep |
| `tmp/` | Build artifact dir | Delete candidate |
| `tmp_payload_stress-task-1.json` | Build artifact | Delete candidate |
| `tmp_payload_test-task-cloud-1234.json` | Build artifact | Delete candidate |
| `tools/` | Source (docker-paperclip, docker-gemini-cli, ai-memory-fragment-monitor, proxmox-nemoclaw-lxc) | Keep |
| `wrappers/` | Source (reference wrappers) | Keep |

---

## Dead-code candidates — summary

Verified via Grep across `c:/Users/Jason/repos/hlbw-ai-hub/` (excluding `node_modules`). No inbound TS/JS/MJS import, no `package.json` script ref, no Dockerfile/cloudbuild/GH-Actions ref, no `.ps1`/`.sh`/`.cmd`/`.bat` invocation, no MCP-config wiring (`.gemini/mcp.json` + `tools/docker-gemini-cli/configs/**/mcp_config.json`), no inline `npx tsx <script>` command in `.agents/workflows/*.md` or `.agents/skills/*/SKILL.md`.

1. `scripts/swarm/delegate.ts`
2. `scripts/swarm/node-a2a-master.ts`
3. `scripts/swarm/test-swarm-concurrency.ts`
4. `scripts/swarm/test-dispatcher.ts`
5. `scripts/swarm/test-memory-monitor.ts`
6. `scripts/swarm/hardware-max-stress.ts`
7. `scripts/swarm/start-trace-viewer.ts`
8. `scripts/swarm/demo-traces.ts`
9. `scripts/swarm/demo-memory-full.ts`
10. `scripts/swarm/demo-workers.mjs`
11. `scripts/swarm/reduce-chunks.ts`
12. `scripts/swarm/docker_exec_proxy.js`
13. `scripts/swarm/build-swarm-worker.sh`
14. `scripts/swarm/build-python-worker.sh`
15. `lib/orchestration/db-sync.ts`
16. `scripts/mcp-wrapper.mjs`

Reclassified Live in rework cycle 1 (previously listed here):
- `scripts/swarm/pool-manager.ts` — invoked by `start-here.ps1:184`.
- `scripts/swarm/watchdog.ts` — invoked by `.agents/workflows/master-agent-coordinator.md:49`.
- `scripts/mcp-dynamic-postgres.mjs` — wired in `tools/docker-gemini-cli/configs/category-4-db/mcp_config.json:6`.
- `.agents/mcp-servers/infrastructure-analyzer/` — wired in `tools/docker-gemini-cli/configs/category-1-qa/mcp_config.json:12` + verified by `scripts/toolchain-doctor.js:293`.

Root-level cruft additionally flagged for deletion:
- `build_log.txt`, `log3.txt`, `logs.txt`, `logs-cloud-2.txt`, `tmp_payload_stress-task-1.json`, `tmp_payload_test-task-cloud-1234.json`, `tmp/`, `.venv/`.

Total files catalogued across sections A–H: **108**.
Total dead-code candidates: **16** (code) + **8** (root cruft artifacts) = **24**.

---

## Spot-check grep (Verifier aid)

Five symbol/file claims above, chosen at random, with the exact Grep used to ground them:

1. `SWARM_POLICY` in `scripts/swarm/policy.ts` — `Grep "SWARM_POLICY" → scripts/swarm/policy.ts:4`.
2. `getNextAvailableTask` defined in `scripts/swarm/arbiter.ts` and imported by `scripts/swarm/watchdog.ts:16` and `scripts/swarm/__tests__/arbiter.test.ts:2`.
3. `lockIssueForWorkload` in `lib/orchestration/db-sync.ts:3` — Grep shows zero live inbound references.
4. `@/lib/prisma` imported by `app/api/scion/execute/route.ts:2` and `app/api/orchestrator/heartbeat/route.ts:2`.
5. MCP binary `.agents/mcp-servers/ast-analyzer/dist/index.js` present on disk; matches `.gemini/mcp.json` `ast-analyzer-mcp.args[0]`.
