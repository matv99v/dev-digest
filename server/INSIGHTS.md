# Insights — `@devdigest/api`

Non-obvious behaviour and traps specific to the server package. Add an entry when
you lose time to something a careful reader could not have predicted. Repo-wide
findings belong in the root `INSIGHTS.md`.

## What Works
<!-- Approaches and solutions that proved out. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — do not skip it. -->

- **Never trust `README.md`'s stated default for `DEVDIGEST_CLONE_DIR`.** It
  documents `./clones`, but that is the `.env.example` value — the code default is
  `~/.devdigest/workspace`. Boot without a `.env` and clones land in your home
  directory, outside the repo and outside the `clones/` gitignore rule, so a hunt
  for them under `server/` finds nothing. — `src/platform/config.ts:67` vs
  `README.md:99` and `.env.example:28` (2026-08-01)

## Codebase Patterns
<!-- Conventions and architecture decisions specific to this package. -->

## Tool & Library Notes
<!-- Dependency quirks and version traps. -->

## Recurring Errors & Fixes
<!-- Errors seen more than once, with the fix. -->

## Session Notes
<!-- ### YYYY-MM-DD — at most one line per session. -->

## Open Questions
<!-- Left unresolved, worth the next person's time. -->
