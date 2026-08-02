# Folders, colocation, and imports

Where code goes, and which direction dependencies may point. Numbered citations refer to
[README.md](./README.md).

## Colocate by default (MEDIUM)

- **Put a file next to the thing that uses it.** A helper used by one component belongs
  in that component's folder, not a global `utils/`. Code that changes together should
  live together.
- **A file moves out only when it gets a second consumer.** Not when you think it might
  get one. "Reusable" is an observation, not a prediction — a second caller is the
  trigger [9].
- **Once a shared utility becomes tightly coupled to one feature, move it back in** [9].
  Migration runs both directions; most codebases only ever run it outward.

## Let structure earn its complexity (MEDIUM)

Structure is not free — every layer is a lookup cost on every future read. Grow through
the stages, and only when the current one hurts [9]:

| Stage | Move on when |
|---|---|
| One file | It holds more than one component and you scroll to find them |
| File per component | A component acquires styles, tests, or helpers of its own |
| Folder per component | — |
| Technical folders (`components/`, `hooks/`, `utils/`) | `components/` is too long to scan |
| Feature folders | Features start clustering into business areas |
| Domain folders | — |

- **Never install the final stage on day one.** A seven-layer taxonomy over four
  components is cost with no benefit.
- **Do adopt the dependency rules immediately** (below). Direction of imports is cheap
  to hold from the start and expensive to retrofit; folder taxonomy is the reverse.

## Dependency direction (CRITICAL)

The one structural rule worth enforcing before you need it.

- **Imports flow one way: `shared → features → app`** [5]. Shared code may be used
  anywhere. A feature may import shared code. The app layer may import both. Nothing
  points back up.
- **Never import across features.** If `billing` needs something from `auth`, either it
  belongs in shared, or the two should be composed one level up, at the app layer [5].
  A cross-feature import is the first step to a cycle.
- **Never let a shared component import feature code.** A `Button` that knows about
  invoices is no longer shared.
- **Enforce it mechanically.** `import/no-restricted-paths` expresses these zones in
  ESLint [5]. A rule a linter checks survives; a rule in a document does not.
- The strict form of this — layers importing only from strictly-below layers, and slices
  never importing siblings on the same layer — is Feature-Sliced Design [6]. Adopt the
  rule; the seven-layer vocabulary is optional.

## Barrel files (`index.ts` re-exports) (HIGH)

A barrel re-exports a directory's contents so consumers can import from the folder. It
is the most common structural mistake in React codebases, and it is measurable.

- **Importing one symbol from a barrel loads every module the barrel re-exports**,
  synchronously. Measured on a real Next.js app: 11k modules and a 5–10s page start,
  down to ~3.5k modules — **−68%** — after internal barrels were removed [8].
- **Barrels cause circular imports.** A sibling importing through its own barrel creates
  `sibling → index → sibling`. JavaScript tolerates it; bundlers fail on it with errors
  that name neither file [8].
- **The framework will not save you.** Next.js `optimizePackageImports` analyzes entry
  files of **external `node_modules` packages** only, and must be configured per
  package. It does nothing for your own barrels [4].

**The position this skill takes:**

- **Never barrel a wide directory** — a `components/` root, a feature root, a `utils/`
  folder. That is the case every measurement above is about, and the payoff is only a
  shorter import line.
- **A barrel over a single small component folder is fine** — three or four files that
  are always imported together, re-exporting that one component's own surface. It loads
  what the consumer was going to load anyway, and it buys a stable import path while the
  internals move around.
- **Barrels are correct when you are shipping a library** [8]. A package needs one entry
  point. Application code is not a package.
- If a barrel has grown past ~20 re-exports, it is no longer a convenience.

## Naming (MEDIUM)

- **Folders: kebab-case.** `run-cost-badge/`, not `RunCostBadge/` or `runCostBadge/`.
  Paths stay readable and case-insensitive filesystems stop mattering.
- **Component files: PascalCase**, matching the exported component.
- **Everything else: camelCase** — `helpers.ts`, `useFindings.ts`.
- **Name folders after the domain, not the layer.** `checkout/` tells a reader what the
  app does; `containers/` tells them what a 2016 tutorial recommended.
- **One component per file.** Small internal helpers used only by that component may
  share it.

## Deciding where a new file goes (MEDIUM)

1. Is it used by exactly one component? → that component's folder. Stop.
2. Used across one feature? → that feature's folder.
3. Used by two or more features? → shared. If it is shared, it may not import feature
   code [5].
4. Unsure between 2 and 3? → choose 2. Moving a file outward later is a rename; moving
   it back in after ten files import it is a refactor.
