---
name: ui-architecture
description: "Decides where frontend code goes in the DevDigest client — the App Router tree, colocation in _components/, when code is promoted to src/components/ or src/lib/, file and folder naming, import direction and path aliases, barrel files as public API, how to split an overgrown component, and where business logic lives. Use whenever adding, moving, splitting or reviewing anything under client/: a new route or page, a component, a hook, a constant, a helper, a style object, a type, or a test. Consult it before creating any new file in client/, even when the task looks small enough to place by eye — placing files by eye is exactly how the inconsistency already in the tree got there."
version: 1.2.0
---

# UI Architecture — `client/`

Answers one question: **which file, which folder, which name.**

The layout below is what `client/src/` already does, written down so you don't
reverse-engineer it each session — and so you don't invent a fourth way to do something
that already has three.

## What this hands off

| Question | Read instead |
|---|---|
| Which file, which folder, which name? | **here** |
| Should this be a hook? Is this effect right? Is it rerendering? | `react-best-practices` |
| Framework file conventions, data fetching, metadata, RSC mechanics | `next-best-practices` |
| How do I write the test body? | `react-testing-library` |
| How do I type this? | `typescript-expert` |
| Where does this go on the **server** (`server/`)? | `onion-architecture` |

## Where things go

Start here. Every row points at a path that exists today — open it when a case is
ambiguous.

| Concern | Location | Why there |
|---|---|---|
| Route entry | `src/app/**/page.tsx` | Thin: composes one view. `src/app/agents/page.tsx` is 6 lines |
| Component used by one route | `_components/<PascalName>/` beside that route | Moving the route moves it too; deleting the route deletes it |
| Component used by ≥2 routes | `src/components/<kebab-name>/` | Promote on the *second* consumer, not in anticipation |
| Design-system primitive | `src/vendor/ui/` | Vendored: extend, never edit in place. A new one needs a showcase entry or `src/test/smoke.test.tsx` fails |
| Pure logic | `helpers.ts` in the owning folder | The part worth unit-testing, kept free of React |
| Constants | `constants.ts` in the owning folder | There is no global `src/constants/`; a shared one couples pages that share nothing |
| Style objects | `styles.ts`, exported as `s` | Inline `CSSProperties` on CSS variables, all-longhand |
| HTTP | `src/lib/api.ts` — nowhere else | One place owns base URL, `ApiError`, headers |
| Server state | `src/lib/hooks/<domain>.ts` | React Query wrappers over `api.ts`, grouped by domain |
| Contract types | `@devdigest/shared`, re-exported by `src/lib/types.ts` | A hand-copied contract drifts from the server silently |
| Cross-cutting utility | `src/lib/<kebab-name>.ts` | One concern per file — `github-urls.ts`, `model-label.ts`. No `utils/` junk drawer |
| Global providers | `src/lib/providers.tsx` | Composed once, mounted in `src/app/layout.tsx` |
| UI strings | `messages/en/<namespace>.json` | Read via `useTranslations("<namespace>")` |
| Test | `<Component>.test.tsx` beside the component | No `__tests__/`. `src/test/` holds setup and the gallery smoke test only |

## The tree

```
client/src/
├── app/                                  # App Router. Folders are URL segments
│   ├── layout.tsx  page.tsx  globals.css
│   └── repos/[repoId]/pulls/             # ← reference route, copy this shape
│       ├── page.tsx                      #   thin entry
│       ├── constants.ts  styles.ts  helpers.ts
│       ├── _components/PRRow/            #   `_` opts the folder out of routing
│       └── [number]/
│           ├── page.tsx
│           └── _components/FindingsPanel/   # ← reference component folder
├── components/<kebab-name>/              # shared across ≥2 routes
├── lib/                                  # api.ts, hooks/, types.ts, providers.tsx, utils
├── test/                                 # setup.ts + smoke.test.tsx only
└── vendor/{ui,shared}/                   # read-only, reached via their barrels
```

`messages/en/*.json` and `src/i18n/request.ts` sit outside `src/app`; strings never live
in component files.

## The one rule that prevents duplicates

Code starts as local as it can and moves outward only when a second caller appears:

```
inside the component  →  folder constants.ts / helpers.ts  →  src/lib/ or src/components/
```

Two halves, and the second is the one people skip:

1. **One consumer means it stays put.** A component parked in `src/components/` that only
   one route imports is a file everyone must consider and nobody can safely change.
2. **The second consumer triggers the move, and the move deletes the original.** Copying
   is what creates the drift this skill exists to stop — two definitions of a status badge
   disagree within a month.

Before writing a helper, grep `src/lib/` and the sibling `helpers.ts`; it often exists
already.

## Go deeper — read the file that matches the task

Each is self-contained. Load only the one you need.

| Task | File |
|---|---|
| Naming a file or folder; what belongs inside a component folder; where a constant/helper/util goes; a folder growing too big | [references/structure-and-naming.md](references/structure-and-naming.md) |
| Writing an import; `@/` vs `./`; adding a path alias; what an `index.ts` should export | [references/imports-and-barrels.md](references/imports-and-barrels.md) |
| A component is too big; extracting a hook; where business logic belongs; composition over prop flags; where state lives | [references/splitting-components.md](references/splitting-components.md) |
| Adding a route; `"use client"` placement; route groups; private folders; the new-route checklist | [references/nextjs-placement.md](references/nextjs-placement.md) |
| Before/after pairs for the five mistakes that actually happen here, plus a full walkthrough | [examples.md](examples.md) |

## Symptom → fix

| Symptom | Fix |
|---|---|
| `page.tsx` over ~30 lines | Move the view into `_components/<Name>/`, leave the route composing it |
| `fetch(` in a component | Add the call to `src/lib/api.ts`, wrap it in a `src/lib/hooks/` hook |
| New file named `utils.ts` | Name it for its concern: `src/lib/<what-it-does>.ts` |
| Component in `src/components/` with one importer | Move it back beside its route |
| A type hand-written to match a server response | Import it from `@devdigest/shared` via `src/lib/types.ts` |
| `import … from "../../../../lib/x"` | `@/lib/x` |
| `export * from "./X"` in a new barrel | List the exports by name |
| Same component pasted into a second route | Promote to `src/components/<kebab>/`, delete both copies |
| A component that fetches *and* transforms *and* renders | Split it — see [references/splitting-components.md](references/splitting-components.md) |
