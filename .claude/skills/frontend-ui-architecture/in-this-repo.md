# In this repo (DevDigest `client/`)

How the principles in this skill map onto the actual codebase. Every path below was
checked against the tree on **2026-08-02** — if one no longer exists, the code moved and
this file is stale.

The other files in this skill are portable. This one is not.

## Where components go

| Reach | Location | Example |
|---|---|---|
| One route | `client/src/app/**/_components/<Name>/` | `app/repos/[repoId]/pulls/_components/PRRow/` |
| Two or more routes | `client/src/components/<kebab-name>/` | `components/run-cost-badge/` |
| Design system | `client/src/vendor/ui/primitives`, `/kit` | `Badge`, `Dropdown`, `CircularScore` |

- **The `_components/` prefix is used consistently** even though the App Router does not
  require it for safe colocation ([nextjs.md](./nextjs.md)) — it keeps UI files from
  competing visually with `page.tsx`.
- **`src/components/` means "used by more than one route", and that bar is real.**
  `run-cost-badge` moved there when the PR list, the PR-detail timeline, and the trace
  drawer all needed it; its header comment records exactly that reason. Follow the
  precedent: state the second consumer when promoting something.
- **`vendor/ui` is the design system and is imported as `@devdigest/ui`.** Reach for an
  existing primitive before styling a new one. It must never import feature code.

## The per-component file convention

A component folder splits its concerns into fixed filenames:

```
FindingCard/
  FindingCard.tsx        component — JSX and local state
  FindingCard.test.tsx   colocated vitest + RTL
  constants.ts           SEV_COLOR, thresholds
  helpers.ts             pure functions (lineLabel, …)
  styles.ts              CSSProperties objects
  index.ts               barrel over this one component
```

- **Follow it for any component that needs more than a single file.** Not every folder
  needs all six.
- This is the local form of [constants-and-helpers.md](./constants-and-helpers.md):
  `constants.ts` and `helpers.ts` scoped to one component, promoted only on a second
  consumer.

## Barrels here are the acceptable kind

All eight directories under `client/src/components/` carry an `index.ts`, and each
re-exports **one component's own files** — 2 to 12 files per folder.

- **This is the narrow case [folders.md](./folders.md) permits**, not the wide-directory
  barrel the sources measure at −68% module count [8]. A consumer of
  `run-cost-badge/index.ts` was going to load `RunCostBadge.tsx` and `helpers.ts`
  anyway.
- **There is no `components/index.ts`**, and there must not be. That would be the wide
  barrel — one import pulling in the diff viewer, mermaid, and the app shell.
- **Do not add a barrel to a feature or route folder.** The rule holds at exactly one
  level: a single component's own surface.

## Styling: inline `CSSProperties`, not utility classes

- **23 `styles.ts` files** export objects typed `satisfies CSSProperties`, applied as
  `style={s.row(hovered)}`. Colours come from CSS custom properties (`var(--crit)`,
  `var(--text-muted)`) defined in `vendor/ui/styles.css`, which is what makes theming
  work.
- **Tailwind v4 is a dependency but components are not written in utility classes.**
  Match the surrounding file; do not convert a component to utilities as a drive-by.
- **This contradicts `react-best-practices`**, which says *"no inline `style={}`
  objects"*. That rule came from another project. In this repo the `styles.ts` convention
  wins — it is what 23 files and the whole theming system are built on.

## Data access

- **All fetching goes through `client/src/lib/hooks/`**, one file per domain: `core.ts`
  (repos, pulls), `reviews.ts`, `agents.ts`, `trace.ts`, `repo-intel.ts`.
- **React Query directly** — `useQuery`/`useMutation` from `@tanstack/react-query`
  (`lib/hooks/core.ts:7`). There is no `useApiQuery` wrapper; `react-best-practices`
  claims otherwise and is wrong about this repo.
- **Query keys are conventional tuples** — `["pulls", repoId]`, `["reviews", prId]`.
  Reuse the existing key for a resource so a second view warms the same cache rather
  than opening a second one.
- **Hooks take an `enabled` argument for lazy fetching** (see `usePrReviews`) — the
  pattern behind hover-triggered loading in the PR list.
- **HTTP lives in `lib/api.ts`.** Components never call `fetch`.

## Contracts

- **`client/src/vendor/shared` holds the Zod contracts, imported as
  `@devdigest/shared`.** It is a *copy* of `server/src/vendor/shared`, not a package —
  the root `CLAUDE.md` covers the rule that both copies must be edited together.
- **Derive types from the contract**; never hand-write a local interface mirroring a
  server shape.

## Server vs client components

Be honest about what this codebase is: **54 of 66 `.tsx` files under `app/` and
`components/` carry `"use client"`.** The studio is effectively a client-rendered SPA
that talks to the Fastify API on `:3001`; `app/layout.tsx` is one of the few server
components.

- **The RSC guidance in [nextjs.md](./nextjs.md) is therefore mostly aspirational
  here.** Data comes from React Query on the client, not from server-side fetches.
- **Do not "fix" this by converting components to server components.** The API is a
  separate process and the data is user-specific and live-polling; client fetching is
  the right call for this app.
- **Do apply it to genuinely new static or server-rendered surfaces**, where the
  boundary rules start paying.

## Other conventions worth knowing

- **i18n**: `client/messages/en/<namespace>.json`, read via
  `useTranslations("<namespace>")`. A feature adds its own namespace file rather than
  editing a shared one. Shared component strings go in `common.json`.
- **Tests are colocated** next to the component as `<Name>.test.tsx`, wrapped in
  `NextIntlClientProvider` with the real messages JSON imported by relative path. There
  is no `@testing-library/user-event` — use `fireEvent`.
- **Empty directories and unused namespaces are placeholders**, not dead code. The root
  `CLAUDE.md` is explicit about not deleting them.
