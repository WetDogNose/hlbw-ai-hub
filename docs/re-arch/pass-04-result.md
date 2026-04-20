# Pass 04 result

**ESCALATE required before pass 5.** This pass drafts a `prisma/schema.prisma` change and a migration SQL file. Per `decisions.md` D5 and `critic-rubric.md` C6, the user must run `npx prisma migrate dev --name unified_task` before any later pass depends on the new columns. No migration was executed by this Actor.

## Changed files
- `prisma/schema.prisma`: extended `Issue` model with nine new columns (`title`, `priority`, `dependencies`, `blockedBy`, `agentCategory`, `isolationId`, `assignedAgentLabel`, `startedAt`, `completedAt`, `metadata`) and flipped `status` default to the unified lowercase vocabulary. All existing relations (`thread`, `assignedAgent`, `goal`, `parentRelations`, `childRelations`, `ledgers`) preserved untouched.
- `scripts/swarm/types.ts`: appended a Prisma-aware adapter block at the bottom. Existing `TaskStatus`, `WorkerStatus`, `Task`, `Worker`, `SwarmState` symbols untouched.
- `prisma/migrations/20260419120000_unified_task/migration.sql`: drafted migration, not applied.

## New symbols (with location)
- Fields added to `model Issue` in `prisma/schema.prisma`:
  - `title String?` at `prisma/schema.prisma:192`
  - `status String @default("pending")` rewritten at `prisma/schema.prisma:194` (default value changed from `"OPEN"`; column type unchanged)
  - `priority Int @default(5)` at `prisma/schema.prisma:195`
  - `dependencies String[] @default([])` at `prisma/schema.prisma:196`
  - `blockedBy String[] @default([])` at `prisma/schema.prisma:197`
  - `agentCategory String?` at `prisma/schema.prisma:198`
  - `isolationId String?` at `prisma/schema.prisma:199`
  - `assignedAgentLabel String?` at `prisma/schema.prisma:200`
  - `startedAt DateTime?` at `prisma/schema.prisma:201`
  - `completedAt DateTime?` at `prisma/schema.prisma:202`
  - `metadata Json @default("{}")` at `prisma/schema.prisma:203`
- TypeScript adapter additions in `scripts/swarm/types.ts`:
  - `import type { Issue, Prisma } from "@prisma/client";` at `scripts/swarm/types.ts:65`
  - `function parseIssueMetadata` at `scripts/swarm/types.ts:69`
  - `function normalizeStatus` at `scripts/swarm/types.ts:76`
  - `export function toTask(issue: Issue): Task` at `scripts/swarm/types.ts:90`
  - `export interface FromTaskContext` at `scripts/swarm/types.ts:108`
  - `export function fromTask(task, context): Prisma.IssueCreateInput` at `scripts/swarm/types.ts:115`

Field count added to `Issue`: **10** new columns (`title`, `priority`, `dependencies`, `blockedBy`, `agentCategory`, `isolationId`, `assignedAgentLabel`, `startedAt`, `completedAt`, `metadata`), plus status-default realignment.

## Deleted symbols
- None. This pass is purely additive. `Task`, `Worker`, `SwarmState`, `TaskStatus`, `WorkerStatus` in `scripts/swarm/types.ts` are preserved verbatim so the swarm runtime keeps working before the migration is applied.

## New deps
- None. `@prisma/client@6.4.1` and `prisma@6.4.1` were already pinned in `package.json` (lines 51 and 67). Verified against `package.json` directly; no new dependencies added.

## Drafted migration
- Path: `prisma/migrations/20260419120000_unified_task/migration.sql`
- User command to apply:
  ```
  cd c:/Users/Jason/repos/hlbw-ai-hub && npx prisma migrate dev --name unified_task
  ```
- The SQL wraps all DDL in `BEGIN … COMMIT`, adds the ten new columns, backfills legacy `Issue.status` values (`OPEN`, `IN_PROGRESS`, `PAUSED`, `BLOCKED`, `COMPLETED`) to the unified lowercase vocabulary, then switches the status default from `'OPEN'` to `'pending'`. No enum rename was performed — the column remains `TEXT` and the unified vocabulary is enforced at the TypeScript layer via `scripts/swarm/types.ts:TaskStatus` plus the `normalizeStatus` adapter.

## SDK signature verification
- `@prisma/client` `Issue` type: `node_modules/.prisma/client/index.d.ts:75` — `export type Issue = $Result.DefaultSelection<Prisma.$IssuePayload>`.
- `@prisma/client` `Prisma` namespace: `node_modules/.prisma/client/index.d.ts:383` — `export namespace Prisma`.
- `Prisma.IssueCreateInput`: `node_modules/.prisma/client/index.d.ts:22801` — confirms `title`, `instruction`, `status`, `priority`, `dependencies`, `blockedBy`, `agentCategory`, `isolationId`, `assignedAgentLabel`, `startedAt`, `completedAt`, `metadata`, `thread`, `assignedAgent`, `goal` after `npx prisma generate` (re-run with the new schema this pass; exit code 0).

## Verifier output
- `npx prisma validate`: PASS (exit 0) — "The schema at prisma\\schema.prisma is valid".
- `npx prisma generate`: PASS (exit 0) — new `Issue` type regenerated in `node_modules/.prisma/client/index.d.ts`.
- `npm run test:types`: PASS (exit 0).
- `npm run test:swarm:types`: PASS (exit 0).
- `npm test`: PASS (exit 0) — 2 suites, 5 tests.
- `npm run lint`: PASS (exit 0) — 80 warnings, 0 errors (pre-existing swarm warnings carried from pass 2; no new warnings introduced).
- `npm run build`: NOT RUN by design. Running the Next.js build against an un-migrated database could exercise runtime Prisma client paths expecting the new schema, which would mask a real migration requirement. This is explicit in the pass 4 spec.

## Open issues / deferred
- **C6 Migration Policy ESCALATION**: the user must run `npx prisma migrate dev --name unified_task` before pass 5. Pass 5's `arbiter.ts` rewrite queries the new columns (`priority`, `dependencies`, `blockedBy`, `status='pending'`) and will error against the un-migrated DB.
- **Status enum**: left as `TEXT` rather than Postgres `ENUM`. Reason: the swarm uses six states while legacy SCION used five with partial overlap; an enum migration would require either dropping the column (data loss) or a multi-step type swap. Keeping `TEXT` with TypeScript-level discriminators via `scripts/swarm/types.ts:TaskStatus` is reversible and loses nothing at runtime.
- **`assignedAgentLabel` vs `assignedAgentId`**: Issue already had the FK `assignedAgentId` → `AgentPersona`. The swarm `Task.assignedAgent` is a free-form string (e.g. `"1_qa"` or a worker container ID), which does not correspond to an `AgentPersona` row. Added a separate `assignedAgentLabel String?` so both can coexist. Pass 5 will decide which one SCION UI reads.
- **Issue.title nullable**: existing rows have only `instruction`. `title` starts as `NULL` and the adapter falls back to `instruction` when rendering a `Task`. Pass 5 may backfill titles from the first line of `instruction`.
- **JSON state file untouched**: `scripts/swarm/state-manager.ts` still reads/writes `.agents/swarm/state.json`. Converting it to read-through Postgres is pass 5 per the spec.

## Cross-repo impact
- None. No edits to `wot-box`, `genkit`, `adk-python`, or `adk-js`.
