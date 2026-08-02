# Next.js App Router — organization decisions

How the App Router changes *where code goes*.

> **Scope.** Framework mechanics — special files, route groups, dynamic segments,
> parallel and intercepting routes, async APIs, metadata, `proxy.ts`, and the rules for
> serializable props across the boundary — belong to
> [next-best-practices](../next-best-practices/SKILL.md). This file covers only the
> placement decisions the framework deliberately leaves open.

Numbered citations refer to [README.md](./README.md).

## Pick one organization strategy and hold it (MEDIUM)

> "Next.js is **unopinionated** about how you organize and colocate your project files."
> [3]

> "The simplest takeaway is to choose a strategy that works for you and your team and be
> consistent across the project." [3]

Three strategies are named [3]:

1. **All project files outside `app/`** — `app/` stays purely routing.
2. **Shared folders at the root of `app/`.**
3. **Split by feature or route** — globally shared code at the `app/` root, specific code
   inside the segment that uses it.

- **Never mix strategies within one codebase.** Any of the three is defensible; two at
  once means no reader can predict where a file is, which is the entire cost this
  decision was meant to avoid.
- **Prefer strategy 3** unless something argues otherwise — it is the one that agrees
  with colocation ([folders.md](./folders.md)), and it is what this skill assumes.

## Colocation in `app/` is already safe (MEDIUM)

The most consequential misreading of the App Router, because it drives where people put
files:

> "a route is **not publicly accessible** until a `page.js` or `route.js` file is added
> to a route segment" [3]

- **Always colocate components, helpers, and tests inside the segment that uses them.**
  They cannot become routes; only what `page.js`/`route.js` returns reaches the client [3].
- **Never add `_private` folders believing they are required for safety.** They are not —
  files in `app/` are safely colocated by default [3]. Most guidance online has this
  backwards, and it leads to defensive structure nobody needs.
- **Use `_folder` when the separation should be visible** — to stop UI files competing
  with routing files in a directory listing, to group them in the editor, and to avoid
  colliding with future Next.js file conventions [3]. Those are the honest reasons.

## The boundary constrains placement (CRITICAL)

The one architectural constraint the App Router adds, and the reason component placement
is not purely taste.

- **Treat every `"use client"` as an entry point, not a file marker.** Marking a component
  pulls its whole import subtree into the client bundle, so the directive belongs at the
  interactive leaves, not near the root where it drags the tree along.
- **Never unify two components that sit on opposite sides of the boundary.** Same shape is
  not the same component; a runtime flag will not stop the bundler from pulling both.
- **Never put a client-only dependency in a folder that server code also imports.** Shared
  means shared by both runtimes, and one stray import moves a module across.
- **Keep secrets on the placement side, not the config side.** Keys and privileged queries
  live in code that never crosses to the client, which makes import direction a security
  property here, not only a bundle-size one.
- **A component whose only job is to add `"use client"` around a subtree is legitimate.**
  It is the boundary made explicit — the one wrapper this skill does not call a smell.

## Bundle discipline (HIGH)

- **Never import through a wide barrel in app code.** One import loads every module the
  barrel re-exports [8], and Next.js only rewrites barrels inside external `node_modules`
  packages — never your own [4]. See [folders.md](./folders.md).
- **Configure `optimizePackageImports` for large third-party libraries** you import from a
  barrel — icon sets, component kits [4]. It does nothing for internal code, so it is not
  an escape from the rule above.
