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

### 2026-09-01 — `CategoryTag` only renders the fixed findings taxonomy; it silently renders nothing for any other string
**Cause:** `CategoryTag`'s `category` prop is typed to the findings `Category` union and looks
up `CAT[category]` — for any string outside that union (e.g. a Conventions Extractor
candidate's freeform `category` field, "naming", "error-handling", ...) `CAT[category]` is
`undefined` and the component returns `null`. No type error either, since callers routinely
pass it a plain `string` cast loosely.
**Rule:** `CategoryTag` is for the findings severity/category taxonomy only. For any other
freeform category/tag string, render a plain `Badge` instead — it takes arbitrary
`children` and never silently drops content.
**Evidence:** `src/vendor/ui/primitives/Badge.tsx:90` (`CategoryTag`) vs. its use as a plain
`Badge` for `Convention.category` in
`src/app/repos/[repoId]/conventions/_components/ConventionCard/ConventionCard.tsx`.

### 2026-08-31 — `src/vendor/shared/contracts/` lags the server's copy — a missing field is usually drift, not your bug
**Cause:** these files are a regenerated copy of `server/src/vendor/shared/contracts/`, and the
regeneration is not automatic. Four pairs are out of sync today, so a value the API plainly
returns can be absent from the schema here — `productionize.ts` accepts only
`'openai' | 'anthropic'` while the server has also had `'openrouter'` for some time.
**Rule:** when a payload fails to parse or a union is missing a member, diff this file against
its server twin before debugging the page — the fix is the regeneration step, never hand-editing
this copy (it is do-not-touch per `AGENTS.md`).
**Evidence:** `src/vendor/shared/contracts/productionize.ts:36` vs
`server/src/vendor/shared/contracts/productionize.ts:36`.

## Tool & Library Notes

### 2026-09-01 — Hand-counting `../` for a `vi.mock` relative path is easy to get wrong, and the failure is silent
**Cause:** `vi.mock` factories can't use the `@/` alias, so every test mocks its module by a
relative path counted up from the test file's own directory. Counting the segments by eye
is off-by-one prone once a component sits 5+ folders under `src/app` — I undercounted by one
level writing `ConventionCard.test.tsx`'s mock of `@/lib/hooks`. A wrong count doesn't error:
Vitest just fails to intercept the module, the component calls the *real* hook, and the test
either throws deep inside React Query or passes for the wrong reason.
**Rule:** don't count `../` by eye — compute it: `node -e "console.log(require('path').relative(require('path').dirname('<test file path>'), '<target module path>'))"` from the package root, then paste the result into `vi.mock(...)`.
**Evidence:** `src/app/repos/[repoId]/conventions/_components/ConventionCard/ConventionCard.test.tsx:8`
mocking `../../../../../../lib/hooks`; confirmed against the working precedent at
`src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.test.tsx:49`.

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
