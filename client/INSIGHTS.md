# Insights — `@devdigest/web`

Non-obvious behaviour and traps specific to the web package. Add an entry when you
lose time to something a careful reader could not have predicted. Repo-wide
findings belong in the root `INSIGHTS.md`.

## What Works
<!-- Approaches and solutions that proved out. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — do not skip it. -->

- **Never anchor a popover inside a PR-list row — the table card clips it with
  no error.** `s.tableCard` sets `overflow: "hidden"` to clip its rows' square
  corners, so an absolutely-positioned hover card mounts and lays out correctly
  but is invisible past the row's edge; nothing warns, and the component tests
  pass because jsdom has no layout. Render floating panels through
  `createPortal(…, document.body)` with `position: fixed`, placed from the
  anchor's `getBoundingClientRect()`. The portal is then not a DOM descendant of
  the anchor, so the anchor's `onMouseLeave` fires as the pointer travels into
  the card — a close delay cancelled by the card's own `onMouseEnter` is
  required, not a nicety.
  — `client/src/app/repos/[repoId]/pulls/styles.ts:86-92`,
  `client/src/components/findings-badge/FindingsCell.tsx:1-8` (2026-08-01)

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
