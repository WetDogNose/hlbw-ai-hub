# Pass 17 result

## Changed files
- scripts/swarm/providers.ts: add `PaperclipAdapter` (wraps LiteLLM `/v1/messages` proxy with the pass-16 `recordProviderUsage` finally pattern + OTEL span) and a `createProviderAdapter(name)` factory that env-gates `paperclip`.
- scripts/swarm/policy.ts: add `categoryProviderOverrides` (JSON-env-driven) + `resolveProviderForCategory(category)` resolver; dispatcher-facing default `{"1_qa":"paperclip"}`.
- .env.example: add `PAPERCLIP_PROXY_URL`, `PAPERCLIP_MODEL`, `CATEGORY_PROVIDER_OVERRIDES` under a new "Swarm Providers (Pass 17)" block.
- tools/docker-paperclip/Dockerfile: promote the LiteLLM model + port to `ARG LITELLM_MODEL` / `ARG LITELLM_PORT` build args, thread through `ENV` into the CMD; preserves prior defaults.

## New files
- scripts/swarm/__tests__/paperclip-adapter.test.ts: 3 jest tests — happy path maps Anthropic response to `GenerationResponse` + ledger hit with `error:false`; HTTP 500 rethrows + `recordProviderUsage` fires with `error:true` in the finally; trailing-slash stripping.
- scripts/swarm/__tests__/provider-factory.test.ts: 5 jest tests — gemini returns `GeminiAdapter`; paperclip throws when either env var missing; paperclip returns `PaperclipAdapter` when both set; unknown name throws.

## New symbols (with location)
- `PaperclipAdapter` class at scripts/swarm/providers.ts:199
- `PaperclipAdapterOptions` interface at scripts/swarm/providers.ts:178
- `createProviderAdapter` function at scripts/swarm/providers.ts:343
- `resolveProviderForCategory` function at scripts/swarm/policy.ts:89
- `SWARM_POLICY.categoryProviderOverrides` field at scripts/swarm/policy.ts:80
- `LITELLM_MODEL` / `LITELLM_PORT` build ARGs at tools/docker-paperclip/Dockerfile:6-7

## Deleted symbols
- (none)

## New deps
- (none — no new npm packages; uses `global.fetch` for the adapter and injected `fetchImpl` in tests)

## New env vars
- `PAPERCLIP_PROXY_URL` — LiteLLM proxy base URL (default `http://127.0.0.1:4000`).
- `PAPERCLIP_MODEL` — LiteLLM model identifier (default `ollama_chat/qwen2.5-coder:32b`).
- `CATEGORY_PROVIDER_OVERRIDES` — optional JSON object mapping `agentCategory → providerName`; invalid JSON is warned and ignored.

## Verifier output
- npx prisma validate: PASS (schema valid)
- npm run test:types: PASS (exit 0)
- npm run test:swarm:types: PASS (exit 0)
- npm test: PASS (15 suites / 107 passed + 1 skipped — unchanged; new tests live under `scripts/swarm/__tests__/` which jest config excludes from default runs per pass-15 convention)
- npm run lint: PASS (0 errors / 70 warnings, ceiling is 79)
- npx jest --testPathIgnorePatterns=/node_modules/ --testPathPatterns=paperclip-adapter: PASS (1 suite / 3 tests)
- npx jest --testPathIgnorePatterns=/node_modules/ --testPathPatterns=provider-factory: PASS (1 suite / 5 tests)
- npm run build: PASS (Compiled successfully)

## Design notes
- Adapter is side-effect-free at construction: does not ping the proxy, does not start the container. `healthcheck()` performs a non-throwing `GET /health` — a down proxy returns `false`.
- Request shape exactly matches the Anthropic Messages API: `{model, max_tokens, system, messages:[{role:"user",content}]}`; header `x-api-key: sk-mock` matches the Dockerfile's `ENV ANTHROPIC_API_KEY=sk-mock`.
- Response parser reads `content[].text` (type=`text`) and prefers proxy-reported `usage.input_tokens`/`usage.output_tokens`, falling back to the same `Math.ceil(chars/4)` approximation Gemini uses.
- Usage ledger: follows the pass-16 REWORK-1 contract — token accumulators hoisted above the try, finally block records `recordProviderUsage` with `error: errored`; an inner try/catch guards against ledger failures masking the original error.
- Factory gates paperclip on env presence to keep the adapter opt-in — `createProviderAdapter("paperclip")` with either env var unset throws a precise error the dispatcher can surface.
- `categoryProviderOverrides` is data, not hard-coded logic: the map is populated from `CATEGORY_PROVIDER_OVERRIDES` JSON when set, otherwise from `DEFAULT_CATEGORY_PROVIDER_OVERRIDES` (currently `{"1_qa":"paperclip"}`). `resolveProviderForCategory(category)` is the only public consumer; callers pass `null`/`undefined` for the default.
- Dockerfile promotion: `ARG LITELLM_MODEL` + `ARG LITELLM_PORT` with matching `ENV` lines; the shell `CMD` substitutes `${LITELLM_MODEL}` / `${LITELLM_PORT}`. `ANTHROPIC_BASE_URL` also parameterised on the port.

## SDK signature verification
- `getTracer` + `startActiveSpan` usage mirrors `GeminiAdapter` in the same file (scripts/swarm/providers.ts:103-155); no new SDK surface.
- `fetch` is the global Web-API `fetch` (Node 20+, Next.js 16); no new import.
- `recordProviderUsage` is the existing pass-16 helper in scripts/swarm/providers.ts:67.

## Open issues / deferred
- Integration-test that actually hits a running paperclip container is out-of-scope for this pass (spec: "Do NOT start the paperclip container in tests"); recommend a follow-up smoke test wired to pass 20's deploy-gate.
- Wiring `resolveProviderForCategory` into the dispatcher/pool-manager task-assignment path is pending — pass 17 only introduces the resolver and the adapter; the switch-over is a one-liner at the dispatcher callsite and has been left to pass 18/20 to avoid rippling into unrelated runner nodes.

## Cross-repo impact
- none

## Boundary discipline
- No edits to sibling repos (`wot-box`, `genkit`, `adk-python`, `adk-js`).
- No edits to `cloudbuild.yaml`.
- No new files at repo root (all new files under `scripts/swarm/__tests__/` and `docs/re-arch/`).
- No schema changes; no Prisma migration.
