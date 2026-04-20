# Checkpoint after pass 24 (post-20 extensions rolled up)

Rolls up passes 21–24 (SCION ops console + write paths + config/analytics + seeder/niche) into a single reference. Per PLAN.md §7.6, this checkpoint is the dispatcher's only retained state from the 21–24 chain — individual pass-NN-verified files can be dropped from the working set after this file exists.

## Frozen interfaces (name → path)
### Introspection (pass 21)
- `getConfigSnapshot`, `getAbilities`, `getWorkflow`, `listLiveWorkers` → `lib/orchestration/introspection.ts`

### Admin-gating + audit (pass 22)
- `requireAdmin(): Promise<IapUser | NextResponse>` → `lib/orchestration/auth-guard.ts`
- `recordAdminAction(actor, action, payload)` → `lib/orchestration/audit.ts` (writes `MemoryEpisode kind:"decision"`)
- `isValidContainerName(name)` → `lib/orchestration/container-names.ts`

### Runtime config (pass 23)
- `getRuntimeConfig(key, fallbackEnv, default)` → `lib/orchestration/runtime-config.ts`
- `setRuntimeConfig(key, value, actorEmail)` (DB-backed, per-key validated)
- `listRuntimeConfig()`
- Keys: `category_provider_overrides`, `cycle_cap`, `confidence_threshold`, `exploration_budget`, `watchdog_timeout_minutes`.
- `RuntimeConfig` Prisma model (`@@map("runtime_config")`, applied migration `20260420132133_runtime_config`).

### Embedding resilience (pass 24 hotfix)
- `ResilientEmbeddingProvider` → `lib/orchestration/embeddings/index.ts`: primary-then-Stub with `lastFallbackReason` introspection. `createEmbeddingProvider` returns this wrapper when `GEMINI_API_KEY` set.
- `VertexEmbeddingProvider` tries `text-embedding-004` → `embedding-001` in sequence.

### SCION UI surface (26 routes total — 5 read, 21 write across passes 21–24)
Read: `/api/scion/{config,abilities,workflow/[id],workers,memory,traces,runtime-config,budget,mcp/[server]/tools,code-index/seed/[jobId],me}`.
Write: `/api/scion/{execute,heartbeat-now,watchdog-now,issue/[id]/{cancel,rerun,resume,resolve,interrupt},issue/[id] PATCH,workers/[name]/{logs,kill,restart},pool/restart,pool/restart/[jobId],runtime-config/[key] PUT,memory/search POST,memory/[id] DELETE,code-index/seed POST,embeddings/test POST,providers/test POST,workflow/[id]/force-transition POST}`.

### Components (22 total, all vanilla CSS)
Pass 21: `ConfigPanel`, `WorkflowGraph`, `AbilityMatrix`, `LiveWorkers`, `TraceSidebar`, `MemoryBrowser`.
Pass 22: `UserChip`, `OperationsHeader`, `IssueDetail`.
Pass 23: `RuntimeConfigPanel`, `BudgetBreakdown`, `TraceFilters`, `MemorySearch`, `MCPToolBrowser`.
Pass 24: `CodeIndexPanel`, `EmbeddingTester`, `ProviderTester`, `TemplateBrowser`, `GraphDebugPanel`.
Dashboard: 4-tab layout (Operations / Workflow / Abilities / Memory).

## Live invariants
- All mutation routes call `requireAdmin()` + `recordAdminAction()`. Non-admin → 403; unauth → 401.
- Every UI mutation triggers a confirm prompt (`window.confirm`).
- No client-side `process.env.X` reads except `NEXT_PUBLIC_*`.
- No secret values in any introspection response; presence flags only.
- Embedding calls never 500 to the UI — ResilientEmbeddingProvider absorbs failures.
- Container-name shell-out always validated against `^hlbw-(worker-warm-|hub-|paperclip|cloudsql-proxy|jaeger|neo4j|memory-monitor)/`.

## Deletions confirmed
- None this chain (only additive work).

## Open issues carrying forward
- `GEMINI_API_KEY` lacks embedding-endpoint access — runtime falls back to Stub. Either switch to Vertex AI SDK + creds, or accept stub-quality retrieval.
- 3 pre-existing actor-critic test flakes (parallel-workers timeout).
- 13 Tailwind-using files outside SCION scope — deferred.
- Cloud Scheduler wiring (pass 6 drafted, not deployed).
- Password rotation (exposed earlier in session).
- `.env` to be added to `.dockerignore`.

## Next work (optional)
- **Pass 25**: Vertex AI SDK migration for embeddings (if retrieval quality matters); or symbol seeder run + context-builder real-world validation.
- **Pass 26**: de-Tailwind the 13 outside-scope files.
- **Pass 27**: wire Cloud Scheduler for heartbeat in prod.
- **Pass 28**: Turn-PPO training loop (currently only the seam exists).

## Container topology as of this checkpoint
- `hlbw-hub-local` → `hlbw-ai-hub-local:0.2.7` (port 3000, on `hlbw-network`, DATABASE_URL → `hlbw-cloudsql-proxy:5432`, `LOCAL_TRUSTED_ADMIN=1`).
- `hlbw-cloudsql-proxy` → `gcr.io/cloud-sql-connectors/cloud-sql-proxy:latest` (port 5432, uses host ADC).
- `hlbw-paperclip` → `hlbw-paperclip:0.2.0`.
- `hlbw-worker-warm-*` × 21 → `hlbw-swarm-worker:0.2.0`.
- Support: jaeger, neo4j, memory-monitor, gemini-cli-container, sentry-validation-worker (unchanged).
