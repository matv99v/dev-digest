# Imports & Barrels

How to write an import, and what a folder is allowed to expose.

## Contents

- [The rule](#the-rule)
- [Aliases](#aliases)
- [The messages exception](#the-messages-exception)
- [Direction](#direction)
- [index.ts is a public API](#indexts-is-a-public-api)
- [Fixing what is already there](#fixing-what-is-already-there)

## The rule

**`./` inside your folder, `@/` the moment you leave it.** More than one `../` means you
have left, so switch to the alias.

```ts
import { s } from "./styles";                    // sibling
import { PRRow } from "./_components/PRRow";     // own child
import { useSettings } from "@/lib/hooks";       // left the folder
import { Badge } from "@devdigest/ui";           // vendored, via its barrel
```

Deep relative paths are the most common defect in the tree today — 383 relative imports
against 30 aliased, with real cases at seven levels
(`src/app/settings/[section]/_components/SettingsView/_components/SettingsApiKeys/SettingsApiKeys.tsx`
reaching `"../../../../../../../lib/types"`). They break the moment a folder moves, and
they hide what is being imported behind a wall of dots. Rewrite one to `@/lib/types` when
you touch the file.

## Aliases

| Alias | Resolves to |
|---|---|
| `@/*` | `client/src/*` |
| `@devdigest/ui` | `client/src/vendor/ui/index.ts` |
| `@devdigest/shared` | `client/src/vendor/shared/index.ts` |

Adding a new alias takes **two** edits — `client/tsconfig.json` *and*
`client/vitest.config.ts`. There is no workspace resolver to inherit from, so an alias
added in one place type-checks and then fails at test time, or the reverse.

## The messages exception

`messages/` sits outside `src/`, so `@/*` cannot reach it directly. Hop out through the
alias:

```ts
import messages from "@/../messages/en/prReview.json";
```

It resolves in both `tsconfig.json` and Vitest. This is the single sanctioned use of `..`
after an alias — everything under `src/` has a direct path. (A dedicated `@messages/*`
alias would read better but needs the two-file edit above.)

## Direction

Imports run one way: **`app/` → `components/` → `lib/` → `vendor/`.**

```
app/          may import  components, lib, vendor
components/   may import  lib, vendor
lib/          may import  vendor
vendor/       imports nothing from the app
```

Three violations worth recognising on sight:

- A file in `src/components/` importing from `src/app/` — shared code cannot depend on one
  route. Whatever it needs should be a prop.
- One route's `_components/` importing another route's — that component is shared by
  definition, so promote it to `src/components/` instead.
- Reaching into `@devdigest/ui` or `@devdigest/shared` at a layer file rather than the
  barrel. The barrel is the contract; the layer files are free to move.

## `index.ts` is a public API

Name what leaves the folder; everything else stays private.

```ts
// src/components/severity-counts/index.ts — the model
export { SeverityCounts } from "./SeverityCounts";
export type { SeverityCountsProps } from "./SeverityCounts";
export { countBySeverity, totalCount, SEVERITY_KEYS } from "./helpers";
export type { SeverityCountMap } from "./helpers";
```

No `export *`, no `default`.

`export *` makes every file in the folder public, which quietly removes the folder's
freedom to refactor — and it is what makes the promotion ladder unenforceable, because
nothing is private to promote *from*. It also costs tree-shaking: the bundler must assume
everything the barrel touches is reachable.

`default` alongside a named export gives the same symbol two import spellings, and the
tree already carries all three variants (`export *`, named + default, curated).

## Fixing what is already there

Existing `export *` barrels — `src/components/app-shell/index.ts` among them — are
grandfathered. Convert one when you are already editing that folder, and rewrite the deep
relative imports in files you touch for other reasons.

A repo-wide sweep is not worth the churn: it would touch most of the tree, produce a diff
nobody can review, and the convention holds just as well if it is applied on contact.
