# Insights

Non-obvious behaviour, traps, and hard-won constraints — what the code and the
READMEs cannot tell you. Add an entry when you lose time to something a careful
reader could not have predicted. Findings scoped to one package belong in that
package's own `INSIGHTS.md` — `server/`, `client/`, `reviewer-core/`, `e2e/`.

## What Works
<!-- Approaches and solutions that proved out. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — do not skip it. -->

- **Never add a REQUIRED field to `RunStats` / `RunTrace`.** These schemas
  describe the `run_traces.trace` jsonb document, and jsonb has no migration —
  every trace already in the DB keeps its old shape forever. The failure is
  silent because the read path never validates: `getRunTrace` casts
  `row.trace as RunTrace` instead of parsing it, so a missing key sails through
  the server and only surfaces far away as `undefined` reaching a formatter in
  the UI. Make every new field `.nullish()` (not `.nullable()` — old documents
  lack the key entirely, they don't hold null), and pin the old shape with a
  fixture that omits it. — `server/src/modules/reviews/repository/run.repo.ts:183`,
  `server/src/vendor/shared/contracts/trace.ts` `RunStats.cost_usd` (2026-08-01)

## Codebase Patterns
<!-- Conventions and architecture decisions that span packages. -->

## Tool & Library Notes
<!-- Dependency quirks and version traps. -->

- **`allowed-tools` in a `SKILL.md` grants permission, it does not restrict.** The
  name reads like an allowlist, but omitting a tool only means it still prompts —
  every tool stays callable. To actually remove one from a skill's reach, use
  `disallowed-tools`. Both apply only to the turn the skill is invoked on and clear
  on the next message. — `.claude/skills/engineering-insights/SKILL.md:4`
  (2026-08-01)

## Recurring Errors & Fixes
<!-- Errors seen more than once, with the fix. -->

## Session Notes
<!-- ### YYYY-MM-DD — at most one line per session. -->

## Open Questions
<!-- Left unresolved, worth the next person's time. -->
