# Critic rubric — applied to every pass-NN-result.md

The Critic sub-agent loads this file and the pass spec from `PLAN.md`, then renders verdict in `pass-NN-critic.md` per the schema in PLAN.md §2.5.

## Verdict
- `PASS` — all checks below pass.
- `REWORK` — at least one check fails; findings list the specific fixes.
- `ESCALATE` — third REWORK cycle, or a check requiring user input (DB migration, sibling repo, deploy).

## Mandatory checks

### C1. Symbol-grounding
For every entry in the result's "New symbols" section:
- Run `Grep` for the symbol name with the cited path filter.
- Must return at least one hit at the cited file (and ideally the cited line).
- FAIL if any symbol is absent.

For every entry in "Changed files":
- Read the file. Confirm the change described actually appears.
- FAIL if a file is cited but the described change is absent.

### C2. Hedge-word scan
Search the result file for any of: `should work`, `in theory`, `I think`, `probably`, `might`, `appears to`, `seems to`, `likely`, `presumably`, `hopefully`.
- FAIL if any match. Findings must quote the offending sentence.

### C3. Test gate
Verify the result's "Verifier output" section reports PASS for:
- `npm run test:types`
- `npm run test:swarm:types`
- `npm test`
- `npm run lint`

Re-run any reported PASS that the Critic suspects is stale (file mtime newer than result mtime). FAIL if any actual run is non-zero exit.

### C4. Schema conformance
The result file must follow the `pass-NN-result.md` schema in PLAN.md §2.5 exactly:
- All required sections present.
- "New deps" section lists pinned versions verified via `npm view` or `pip index versions`.
- "Cross-repo impact" present (even if "none").

FAIL if any section missing or misnamed.

### C5. Deletion safety
For every entry in "Deleted symbols":
- The result must cite a Grep command that confirmed zero inbound refs across `c:/Users/Jason/repos/hlbw-ai-hub/`, `c:/Users/Jason/repos/wot-box/`, `c:/Users/Jason/repos/genkit/`, `c:/Users/Jason/repos/adk-python/`, `c:/Users/Jason/repos/adk-js/`.
- Critic re-runs the Grep. FAIL if any inbound ref exists.

### C6. Migration policy
If `prisma/schema.prisma` was modified or a new file under `prisma/migrations/` was created:
- The result must include the drafted `migration.sql` path.
- The result must NOT claim `prisma migrate dev` was executed.
- ESCALATE so the user can approve the migration.

### C7. SDK signature verification
For every external SDK call introduced in the diff:
- The result must cite the `node_modules/<pkg>/.../*.d.ts` (or `package.json`) it was verified against.
- Critic Greps the cited file for the called symbol. FAIL if absent.

### C8. Boundary discipline
- No edits to sibling repos (`wot-box`, `genkit`, `adk-python`, `adk-js`). FAIL if any.
- No edits to `cloudbuild.yaml` deploy steps until pass 20. FAIL otherwise.
- No new files at repo root. FAIL otherwise.

## Findings format
```markdown
## Findings
- C1 Symbol-grounding: PASS (5/5 symbols verified)
- C2 Hedge-word scan: FAIL — line 23 "should work for most cases"
- C3 Test gate: PASS
- C4 Schema conformance: PASS
- C5 Deletion safety: N/A (no deletions)
- C6 Migration policy: N/A
- C7 SDK signature verification: PASS (1/1 cited)
- C8 Boundary discipline: PASS
```

## Verdict precedence
- Any FAIL → REWORK (or ESCALATE if cycle 3).
- Any ESCALATE check (C6 with migration ready, or any C8 sibling-repo issue) → ESCALATE regardless of other checks.
