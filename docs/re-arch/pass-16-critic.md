# Pass 16 critic verdict

> REWORK cycle 2 — re-verification of cycle 1 finding #6 (error-path `recordProviderUsage` gap). All prior checks (C1, C2, C4, C5, C6, C7, C8 + pass-16-specific items 1–5) were PASS in cycle 1 and are not re-litigated here.

## Verdict: PASS

## Findings
- C1 Symbol-grounding: PASS (carried from cycle 1; new/updated symbols `RecordProviderUsageInput.error` at `scripts/swarm/providers.ts:58`, `RecordTokenUsageInput.error` at `lib/orchestration/budget.ts:48` verified present).
- C2 Hedge-word scan: PASS (grep across `docs/re-arch/pass-16-result.md` for the 10 hedge phrases returned zero matches, case-insensitive).
- C3 Test gate:
  - `npm run test:types` — PASS (exit 0; memory-tracker wrapper reported no tsc output, i.e., clean typecheck).
  - `npm run test:swarm:types` — PASS (exit 0; `scripts/tsconfig.json` clean).
  - `npm test` — PASS (15 passed + 1 skipped of 16 suites; 107 passed + 1 skipped of 108 tests; matches Actor claim of exactly 15/107).
  - `npm run lint` — PASS (0 errors, 68 warnings; ceiling 79; matches Actor claim of 68).
  - `npm run build` — PASS (26 routes compiled; all pass-16 routes `/api/scion/state`, `/api/scion/issue/[id]`, `/api/orchestrator/stream`, `/api/scion/execute` present).
- C4 Schema conformance: PASS (carried; pass-16-result.md adds `## Changed files — REWORK cycle 1` subsection which is an additive annotation and does not break the schema).
- C5 Deletion safety: N/A (no deletions).
- C6 Migration policy: N/A (no `prisma/schema.prisma` edits; cycle 1 chose the flag-without-migration path and `RecordTokenUsageInput.error` is a TS-only field surfaced via `console.warn`, not a new DB column).
- C7 SDK signature verification: PASS (carried; no new external SDK calls introduced in cycle 1).
- C8 Boundary discipline: PASS (carried; cycle 1 edits limited to `scripts/swarm/providers.ts`, `lib/orchestration/budget.ts`, `lib/orchestration/__tests__/budget.test.ts`, `docs/re-arch/pass-16-result.md`).

### Cycle 1 fix re-verification (finding #6)
1. **try/catch/finally structure with `recordProviderUsage` in finally**: PASS. `scripts/swarm/providers.ts:101-156` `GeminiAdapter.generate` now wraps the generation in `try { ... return ... } catch (err) { errored = true; span.recordException(err); throw err } finally { try { await recordProviderUsage({..., error: errored}) } catch (recErr) { console.warn(...) } span.end() }`. Structure matches the rubric requirement exactly.
2. **Invocation count ≥1 in finally (or ≥2 for dual-path)**: PASS. Grep for `recordProviderUsage` in `providers.ts` returned 6 hits (lines 6, 67, 91, 139, 142, 151). The functional call site is line 142 inside the `finally` block — executed on BOTH success and error paths by language semantics. Satisfies the ≥1-in-finally rule.
3. **Ledger-write failure does not mask original error**: PASS. Line 141-152 wraps the `recordProviderUsage` call in its own inner `try/catch` that logs `console.warn("recordProviderUsage failed", recErr)` and swallows the ledger error. The outer `catch` block at line 132-135 has already set `errored = true` and called `throw err`, which is re-raised after the `finally` runs; the inner catch prevents a secondary throw from the ledger path from overwriting it.
4. **Two new error-path tests in `budget.test.ts`**: PASS.
   - Test `"writes a ledger row when the provider call throws (error:true)"` at `lib/orchestration/__tests__/budget.test.ts:169-191` — passes `error: true`, asserts `ledgerCreate` fires exactly once with `issueId: 'i-err'` and `tokensUsed: 42`.
   - Test `"error-flagged rows still count toward the daily budget total"` at `lib/orchestration/__tests__/budget.test.ts:193-211` — mocks aggregate at `DAILY_TOKEN_LIMIT + 500`, asserts `assertBudgetAvailable` throws `BudgetExceededError` with `totalUsage === DAILY_TOKEN_LIMIT + 500`.
   - Jest run confirms both tests PASS under `lib/orchestration/__tests__/budget.test.ts` within the 107-test total.
5. **`span.end()` still fires on error**: PASS. `span.end()` is at line 153 inside `finally`, so it runs whether the try returns or the catch rethrows.

## If REWORK
(N/A — PASS.)

All cycle 1 findings resolved. No new regressions. Ready to advance to pass 17.
