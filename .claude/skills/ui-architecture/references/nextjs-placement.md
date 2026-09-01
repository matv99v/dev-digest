# Next.js App Router Placement

Where route files go, where the client boundary sits, and the checklist for a new route.

For RSC data-fetching mechanics, metadata and route-handler details, use
`next-best-practices`. This file covers placement only.

## Contents

- [What makes a route](#what-makes-a-route)
- [Private folders](#private-folders)
- [Route groups](#route-groups)
- [The client boundary](#the-client-boundary)
- [Providers](#providers)
- [Adding a route — checklist](#adding-a-route--checklist)

## What makes a route

A folder under `app/` becomes a public URL **only when it contains `page.tsx`** (or
`route.ts`). Everything else colocated there stays private, so colocation is safe by
default and needs no ceremony.

Route files stay thin. `src/app/agents/page.tsx` is the whole file:

```tsx
import { AgentsListView } from "./_components/AgentsListView";

/* Route: /agents (Agents list). Thin route entry — the view, its create modal,
   styles, constants, helpers and i18n are colocated under _components/AgentsListView. */
export default function AgentsPage() {
  return <AgentsListView />;
}
```

The route file states *what URL renders what*. Everything that can change without the URL
changing lives one level down, which is also what keeps the route a Server Component.

## Private folders

`_components/` opts a folder out of routing. Colocation already protects non-route files,
so the underscore is not strictly required — it earns its place by separating UI from
routing at a glance, keeping folders grouped in the editor, and staying clear of future
Next.js file conventions.

This repo uses `_components/` only. Route-local helpers, constants and styles sit as plain
files in the route folder (`src/app/repos/[repoId]/pulls/constants.ts`), not in a `_lib/`.

## Route groups

`(folder)` groups routes without appearing in the URL — useful for giving a section its own
layout. Two pitfalls:

- Two groups must not resolve to the same path; `(a)/about` and `(b)/about` collide.
- Multiple **root** layouts cause a full page reload when navigating between them.

The repo does not use route groups yet. Reach for one when a section needs its own layout,
not to tidy the file list.

## The client boundary

`"use client"` marks a **module graph**, not a file: everything the marked file imports
goes to the client with it. That makes it a placement decision.

- Pages and layouts stay Server Components unless they need state, effects, browser APIs or
  hooks. Only `src/app/agents/page.tsx` and `src/app/settings/[section]/page.tsx` currently
  manage this — most pages became client components by inheritance, not by need.
- Push the directive down to the interactive leaf. A page that is static except for a
  filter bar keeps `"use client"` on the filter bar.
- To render server-fetched UI inside a client component, pass it as `children` rather than
  importing it. Children are rendered on the server and never enter the client graph:

  ```tsx
  // Modal is "use client"; Cart stays on the server
  <Modal>
    <Cart />
  </Modal>
  ```

## Providers

Providers wrap `{children}` as deep as they can. `src/lib/providers.tsx` composes
`QueryClientProvider > ThemeProvider > ToastProvider > RepoProvider` and is mounted around
the body content in `src/app/layout.tsx`, not around `<html>` — the shallower the wrap, the
more of the tree stays static.

React context is not available in Server Components, so a provider is always a client
component that takes `children`.

## Adding a route — checklist

1. `src/app/<segments>/page.tsx` — thin, renders one view component.
2. `_components/<ViewName>/` beside it: `<ViewName>.tsx`, `index.ts`, plus `styles.ts` /
   `constants.ts` / `helpers.ts` as needed.
3. Data through an existing `src/lib/hooks/` hook. If the endpoint is new, add it to
   `src/lib/api.ts` first, then the hook — never `fetch` from the component.
4. Types from `@devdigest/shared` via `src/lib/types.ts`. Check before defining one.
5. Strings into `messages/en/<namespace>.json`, read with `useTranslations`.
6. `<ViewName>.test.tsx` beside the component.
7. `"use client"` on the interactive leaves, not the page, where possible.
8. `cd client && pnpm typecheck && pnpm test`.
