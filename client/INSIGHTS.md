# Insights — client

Lessons learned working in `@devdigest/web`. Append with `/engineering-insights`.
**Never rewrite or delete an entry** — correct an outdated one by adding a newer dated
entry that supersedes it. If a finding also concerns another module, write that module's
half in its own `INSIGHTS.md`. The root file is for root config and CI only.

When an entry has bitten twice, promote its **Rule** into `AGENTS.md` and leave the cause
here. Architectural decisions with reasoning belong in `docs/`, not here. Prune
quarterly; past ~30 entries, split by domain.

<!-- Entry format — newest first inside its section:
### YYYY-MM-DD — one-line statement of the finding
**Cause:** what was actually wrong (omit when nothing failed).
**Rule:** what to do or avoid next time. Required.
**Evidence:** `path/to/file.ts:42`. Required.
-->

## What Works

_No entries yet._

## What Doesn't Work

### 2026-08-29 — A one-shot value consumed inside `useEffect` is silently emptied by StrictMode, in dev only
**Cause:** `reactStrictMode: true` makes dev invoke every effect twice. An effect that both
consumed a take-once value and stored it took the id on pass 1, then overwrote it with pass
2's `null`. Production invokes effects once, so the feature worked in `next build` and was
dead only on the dev server — it looked like the navigation was broken, not the read.
**Rule:** An effect consuming a one-shot (a module slot, a queue, any `takeX()`) needs a
`useRef` guard keyed to its input so the second invocation returns early. Its test must
render inside `<StrictMode>` — a plain RTL `render` does not double-invoke and passes either
way, so it cannot catch this.
**Evidence:** `src/lib/finding-target.ts:41`, `src/lib/finding-target.test.tsx`,
`next.config.mjs:7`.

## Codebase Patterns

_No entries yet._

## Tool & Library Notes

_No entries yet._

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
