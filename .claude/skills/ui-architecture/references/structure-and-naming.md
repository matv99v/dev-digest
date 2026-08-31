# Structure & Naming

What belongs inside a folder, what each file is called, and when something moves.

## Contents

- [A component folder](#a-component-folder)
- [Naming](#naming)
- [Constants, helpers, utils](#constants-helpers-utils)
- [The promotion ladder](#the-promotion-ladder)
- [When a folder is too big](#when-a-folder-is-too-big)
- [Anti-patterns](#anti-patterns)

## A component folder

```
FindingsPanel/
├── FindingsPanel.tsx        # the component — one per file, PascalCase
├── FindingsPanel.test.tsx   # colocated
├── index.ts                 # the public API
├── constants.ts             # optional
├── styles.ts                # optional — exports `s`
├── helpers.ts               # optional — pure functions
└── _components/             # optional — children only this folder uses
```

The vocabulary is fixed on purpose: a reader knows where the pure logic is before opening
the folder. `types.ts` and `hooks/` join the list when a folder needs them
(`src/components/app-shell/hooks/useGlobalShortcuts.ts`).

A file outside this vocabulary is a signal the folder is doing two jobs — split it rather
than inventing a name. Nesting goes through `_components/` at every level, as
`src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/` already does.

## Naming

| Thing | Case | Example |
|---|---|---|
| Folder under `_components/` | PascalCase, matches the component | `FindingCard/` |
| Folder under `src/components/` | kebab-case | `severity-counts/` |
| File in `src/lib/` | kebab-case | `github-urls.ts` |
| Component file | PascalCase, one component per file | `FindingCard.tsx` |
| Support file | lowercase, from the fixed vocabulary | `constants.ts` |
| Hook file | `use<Name>.ts` when one per file | `useGlobalShortcuts.ts` |
| Test | `<Component>.test.tsx` | `FindingCard.test.tsx` |
| Constant value | `UPPER_SNAKE_CASE` | `G_NAV_TIMEOUT_MS` |
| Type / interface | `PascalCase` | `SeverityCountMap` |
| Boolean | `is` / `has` / `should` prefix | `isLoading` |
| Event handler | `handle` prefix; the prop it fills takes `on` | `handleSubmit` → `onSubmit` |

`src/lib/hooks/` is the deliberate exception to one-hook-per-file: it groups by domain
(`core.ts`, `agents.ts`, `reviews.ts`, `trace.ts`) because those hooks are read together.

Anything returning JSX is PascalCase, including a helper. `renderRow()` returning JSX
should be `<Row />` so React sees a component and the rules of hooks apply to it.

## Constants, helpers, utils

Three different things, three different homes:

| Kind | Definition | Home |
|---|---|---|
| **constants** | Named values that stop magic numbers and strings from spreading | `constants.ts` in the owning folder |
| **helpers** | Project-specific glue — meaningless outside DevDigest | `helpers.ts` in the owning folder, or `src/lib/<name>.ts` once shared |
| **utils** | Generic and pure — would make sense in any project | `src/lib/<name>.ts`, named for the concern |

The helpers/utils split matters because it predicts where a function ends up. A pure
function of its arguments can move anywhere; a function that knows about `FindingRecord`
and severity ordering belongs near the feature that owns that concept.

`src/components/severity-counts/helpers.ts` is the shape to copy: exported constants, an
exported type, and small pure functions, each documented in one line.

Side effects mean it is not a util. A function that calls the API belongs in
`src/lib/api.ts` behind a hook, not in a helpers file.

## The promotion ladder

```
inside the component  →  folder constants.ts / helpers.ts  →  src/lib/ or src/components/
```

Promote **on the second consumer**, and only to the *lowest common* level — a helper two
sibling components share belongs in their shared parent folder, not in `src/lib/`.

The move deletes the original. Promotion that leaves a copy behind is duplication with
extra ceremony, and the two copies will disagree.

The reverse applies too and is almost never done: a shared file that has lost all but one
consumer should move back down beside it.

## When a folder is too big

Rough thresholds, not laws — they mark the point where a reader starts scanning instead of
navigating:

- A component file past **~200 lines**, or doing more than one thing → see
  [splitting-components.md](splitting-components.md).
- `_components/` or `src/components/` past **~15–20 entries** → group the related ones into
  a parent folder with its own `_components/`.
- Nesting past **3–4 levels** below `src/` → prefer a longer, more specific component name
  over another folder. `src/app/settings/[section]/_components/SettingsView/_components/SettingsApiKeys/`
  is at the practical limit already.

## Anti-patterns

- A `utils.ts` or `helpers/index.ts` junk drawer. If you cannot name what a function
  belongs to, it belongs beside its one caller until a second appears.
- Hoisting a component-local helper to `src/lib/` before anything else imports it.
- A parallel test tree mirroring `src/`. Tests sit beside their subject; `src/test/` holds
  only setup and the gallery smoke test.
- Inventing a file name outside the vocabulary (`FindingsPanel.data.ts`,
  `findings-utils.ts`) instead of splitting the folder.
- A global `src/constants/` or `src/types/`. Neither exists here; contract types come from
  `@devdigest/shared` via `src/lib/types.ts`.
