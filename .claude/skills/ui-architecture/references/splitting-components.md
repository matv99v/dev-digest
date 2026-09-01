# Splitting Components & Placing Logic

When a component is doing too much, what to pull out, and where the piece lands.

For hook *rules* and React anti-patterns, use `react-best-practices`. This file is about
placement and boundaries only.

## Contents

- [When to split](#when-to-split)
- [When you have split too far](#when-you-have-split-too-far)
- [What to pull out, and where it goes](#what-to-pull-out-and-where-it-goes)
- [Composition instead of more props](#composition-instead-of-more-props)
- [Where state lives](#where-state-lives)
- [Extracting a hook](#extracting-a-hook)

## When to split

A component should have **one reason to change**. Signals it has more:

- You describe it with "and" — "renders the list *and* fetches *and* filters".
- You must edit component A to change the behaviour of component B.
- It fetches, transforms, holds state, and renders — four independent axes of change.
- The file passes ~200 lines, or the JSX has more `?` and `&&` than tags.

Split for responsibility, not line count alone. A 220-line component doing exactly one
thing is fine; a 90-line one doing three is not.

## When you have split too far

- Components that only forward props and add a layer of indirection.
- More files than the feature's complexity warrants — a folder of six files for a badge.
- A pass-through wrapper that exists so a name reads nicely.

Some duplication is cheaper than the wrong abstraction. Extract on the second real
occurrence, not the first suspicion of one.

## What to pull out, and where it goes

| Kind of code | Becomes | Lands in |
|---|---|---|
| A chunk of JSX with its own concern | A child component | `_components/<Name>/` inside the folder |
| Pure calculation, filtering, formatting | A plain function | `helpers.ts` in the same folder |
| Named values, thresholds, column definitions | Constants | `constants.ts` in the same folder |
| Style objects | The `s` object | `styles.ts` in the same folder |
| State + effects that belong together | A custom hook | `hooks/use<Name>.ts` in the folder |
| Anything that talks to the API | A query hook over `api.ts` | `src/lib/hooks/<domain>.ts` |

The direction is always the same:

```
component (renders)  →  hook (React glue)  →  helpers (pure rules)
                                           →  src/lib/api.ts (I/O)
```

**Do not build all four layers for a one-line transform.** The separation pays off when
there is real logic to isolate; three files wrapping a single `fetch` is ceremony. Apply it
proportionally to the complexity actually present.

## Composition instead of more props

When a component accumulates props that only exist to configure rendering, pass elements
instead of flags:

```tsx
// ❌ every new variation adds a boolean
<Panel title="Findings" showFilter hideFooter compact actions={...} />

// ✅ the caller owns the content, the panel owns the arrangement
<Panel header={<FindingsFilter />}>
  <FindingsList />
</Panel>
```

Reserve `children` for the main content area and use named element props for other slots
(`header`, `actions`, `footer`).

For mutually exclusive states, prefer early returns over nested ternaries — extract the
shared chrome into a layout component taking `children`, then return each branch:

```tsx
if (isLoading) return <Layout><Skeleton /></Layout>;
if (error)     return <Layout><ErrorState error={error} /></Layout>;
if (!rows.length) return <Layout><Empty /></Layout>;
return <Layout><Rows rows={rows} /></Layout>;
```

This reads top-to-bottom, extends without touching existing branches, and lets TypeScript
narrow the types after each return.

## Where state lives

Keep state at the lowest level that still covers every consumer. Lift it only when a
second component genuinely needs it, and to the least common parent — not to a provider.

The neglected half: when a requirement changes and only one component still uses a piece
of lifted state, push it back down. Lifting is habitual; colocating again is not, which is
how state accumulates near the root.

State that belongs in the URL — the selected tab, an active filter, a page number — goes in
search params rather than `useState`, so a reload and a shared link both work.

Server state is not component state. It belongs in a `src/lib/hooks/` React Query hook, and
the cache is the single source of truth for it.

## Extracting a hook

Extract when there is a repeated `useState`/`useEffect` cluster, or an effect that
synchronises with something outside React, and the component now reads as wiring instead of
intent.

Two rules that decide the file name:

- **`use` prefix only if it calls hooks.** A function that just sorts or filters is a plain
  function in `helpers.ts` — naming it `useSorted` blocks calling it conditionally for no
  gain.
- **Name it for a concrete use case**, not a lifecycle. `useShellCommands`, `useInsights`,
  `useGlobalShortcuts` constrain what they can do; `useMount` or `useEffectOnce` wrap the
  API itself, hide missing dependencies from the linter, and constrain nothing.

The name test: if you cannot give it a clear name, it is still too coupled to extract.

**Placement.** A hook with one consumer sits in that folder's `hooks/`
(`src/components/app-shell/hooks/useGlobalShortcuts.ts`). A hook that fetches goes in
`src/lib/hooks/<domain>.ts` regardless of how many consumers it has — that is where the
React Query keys live, and a second caller is a matter of time.
