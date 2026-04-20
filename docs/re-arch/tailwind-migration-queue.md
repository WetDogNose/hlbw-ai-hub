# Tailwind migration queue

Pass 3 of the re-arch landed vanilla CSS on SCION + orchestration widgets. Fourteen other files were out of scope at that pass and remain as carry-forward. This doc is the standalone migration queue for them.

Project rule (`.cursorrules`, `.geminirules`, [CLAUDE.md](../../CLAUDE.md)): **vanilla CSS only**. No Tailwind utility classes (`p-4`, `flex-col`, `gap-6`, `text-blue-500`, `bg-white`, `rounded-lg`, etc.). All styles belong in [app/globals.css](../../app/globals.css) under semantic class names tied to CSS variables (`var(--bg-primary)`, `var(--shadow-md)`, …).

## Queue — 14 files, 181 utility-class occurrences

Ordered by user-visibility (most visible first):

| # | Path | Count | Typical patterns observed |
|---|------|------:|---------------------------|
| 1 | `app/admin/configuration/client.tsx` | 60 | `flex`, `flex-col`, `gap-*`, `px-*`, `py-*`, `text-*-*`, `bg-*-*`, `rounded-lg`, `grid-cols-*` |
| 2 | `app/settings/page.tsx` | 27 | `flex`, `gap-*`, `items-*`, `p-*`, `rounded-*`, `shadow-*` |
| 3 | `app/admin/appearance/page.tsx` | 25 | `grid-cols-*`, `gap-*`, `p-*`, `rounded-*`, `border-*` |
| 4 | `app/admin/maintenance/client.tsx` | 13 | `flex-col`, `gap-*`, `p-*`, `text-*-*` |
| 5 | `app/admin/ai/client.tsx` | 11 | `flex`, `gap-*`, `p-*`, `text-*` |
| 6 | `components/thread/ChronologyTimeline.tsx` | 9 | `flex`, `gap-*`, `items-*`, `rounded-*` |
| 7 | `components/thread/ApprovalWidget.tsx` | 8 | `flex`, `p-*`, `rounded-*`, `shadow-*` |
| 8 | `app/page.tsx` | 7 | `flex-col`, `items-center`, `justify-center`, `gap-*`, `mt-*`, `mb-*` |
| 9 | `app/admin/stats/client.tsx` | 7 | `flex`, `grid-cols-*`, `gap-*`, `p-*` |
| 10 | `components/thread/LiveExecutionBlock.tsx` | 6 | `flex`, `gap-*`, `rounded-*` |
| 11 | `app/thread/[id]/page.tsx` | 4 | `flex`, `p-*`, `gap-*` |
| 12 | `app/docs/layout.tsx` | 2 | `flex`, `gap-*` |
| 13 | `app/admin/layout.tsx` | 1 | `flex` |
| 14 | `components/admin-nav.tsx` | 1 | `ml-2` (on `.badge.badge-danger` alongside semantic classes) |

## Execution recipe per file

1. Read the file, catalogue every unique class literal.
2. For each, pick or add a semantic class under `app/globals.css`:
   - SCION-family prefix: `.scion-…`
   - Orchestration: `.orchestration-…`
   - Admin: `.admin-…`
   - Thread: `.thread-…`
   - Settings: `.settings-…`
   - Homepage: `.home-…`
3. Replace the utility-class string with the new semantic class.
4. Re-run `npm run build` + `npm run lint`. No new lint warnings.
5. Grep the updated file for `(p-|m-|gap-|flex-col|grid-cols-|text-\w+-\d|bg-\w+-\d|rounded-|shadow-)` — expect zero hits.

## Acceptance criteria (per file)

- Zero Tailwind utility classes in the file.
- Visual parity screenshot-reviewed by the user (Tailwind is stripped from the CSS pipeline, so utility classes currently render as no-op; the parity bar is "not-worse-than-current").
- `npm run build` and `npm run test:types` exit 0.

## Notes

- The Tailwind packages are no longer in the CSS pipeline — utility classes render unstyled today. The migration is low-risk visual work; no JS behavior changes.
- `components/admin-nav.tsx` has one residual `ml-2` inline with an otherwise-semantic `.badge.badge-danger`; trivially replaceable with a new `.badge-spacer` or appended margin on the parent selector.
- Recommend batching 3–5 files per PR to keep review tractable.
