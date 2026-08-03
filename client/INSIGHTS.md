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

- **Mocking a data hook as `() => ({ data, isLoading: false })` hides a Rules-
  of-Hooks violation where a hook sits after a loading-guard early return.**
  This repo's standard test pattern (`vi.mock(".../lib/hooks/...", () => ({
  useX: () => ({ data, isLoading: false }) }))`, used across
  `AgentEditor.test.tsx`, `MarkdownEditor.test.tsx`, `ConfigTab.test.tsx`,
  `VersionsTab.test.tsx`, `StatsTab.test.tsx`, `SkillsListColumn.test.tsx`,
  `SkillsTab.test.tsx`) never actually exercises a real loading render, so a
  hook declared after `if (isLoading || !data) return null;` — its presence
  varying render-to-render — never gets caught: the full suite (300+ tests)
  stayed green while `SkillsTab.tsx:57`'s `React.useRef` (declared after
  exactly that guard) crashed live in the browser with "Rendered more hooks
  than during the previous render." A component using this mock pattern with
  ANY hook after a loading-guard return needs a test that flips the mocked
  `isLoading` from true to false across an RTL `rerender()` on a MOUNTED
  instance — only that reproduces the transition. See
  `SkillsTab.test.tsx`'s "the loading → loaded transition does not change
  hook order" test for the pattern.
  — `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx:20-24`
  (2026-08-03)

## Codebase Patterns
<!-- Conventions and architecture decisions specific to this package. -->

## Tool & Library Notes
<!-- Dependency quirks and version traps. -->

- **`getByPlaceholderText`/other RTL text matchers normalize the RENDERED
  text's whitespace but not your query string.** A real `placeholder`
  containing an embedded `\n` (e.g. `skills.json`'s `file.bodyPlaceholder`,
  `"# Rule\nDescribe the rule…"`) gets its newline collapsed to a space before
  RTL compares it — so querying with that same literal `\n` in your string
  never matches, and the failure just says "unable to find element" with no
  hint why. Use a regex (`getByPlaceholderText(/Describe the rule/)`) for any
  placeholder/label that spans multiple lines. —
  `client/src/app/skills/_components/ImportSkillDrawer/ImportSkillDrawer.test.tsx:59`
  (2026-08-03)

## Recurring Errors & Fixes
<!-- Errors seen more than once, with the fix. -->

## Session Notes
<!-- ### YYYY-MM-DD — at most one line per session. -->

## Open Questions
<!-- Left unresolved, worth the next person's time. -->
