# frontend-ui-architecture — sources and rationale

Every link behind the [`frontend-ui-architecture`](./SKILL.md) skill: what was cited,
what was consulted and rejected, where the sources disagree, and which repo files the
skill depends on.

**Version 1.0.0** — see [Changelog](#changelog).

The skill answers one question — *where does this code go?* — and deliberately does not
restate [react-best-practices](../react-best-practices/SKILL.md) (how the code should be
written) or [next-best-practices](../next-best-practices/SKILL.md) (what the framework
requires).

Sources were fetched and read on **2026-08-02**, not cited from search summaries — the
quotes below are what each page actually says. Rules in the topic files cite these by
number, e.g. `[3]`. A rule with no number is this skill's own judgement, and says so.

## Contents

- [Cited sources](#cited-sources) — [1]–[10]
- [Consulted, not cited](#consulted-not-cited)
- [Internal references](#internal-references)
- [Where the sources disagree](#where-the-sources-disagree)
- [Changelog](#changelog)

---

## Cited sources

### Official documentation

### [1] React — You Might Not Need an Effect
<https://react.dev/learn/you-might-not-need-an-effect>

**No longer cited by this skill.** It backed the derive-don't-store and
event-handler-vs-Effect rules, which the v1.0.0 rewrite removed as duplicating
[react-best-practices](../react-best-practices/SKILL.md) §Derive Don't Store and §Hooks.
Kept here because it is the primary source for those rules and because
[logic.md](./logic.md) points readers at that skill.

> "When something can be calculated from the existing props or state, don't put it in
> state. Instead, calculate it during rendering."

> "If this logic is caused by a particular interaction, keep it in the event handler.
> If it's caused by the user *seeing* the component on the screen, keep it in the Effect."

Effects are framed as "an escape hatch from the React paradigm" for synchronizing with
external systems — not a general-purpose place to put logic.

### [2] React — Thinking in React
<https://react.dev/learn/thinking-in-react>

Backs the component-splitting criteria in [components.md](./components.md). Its state
guidance is not used here — that belongs to
[react-best-practices](../react-best-practices/SKILL.md).

> "a component should ideally only be concerned with one thing. If it ends up growing,
> it should be decomposed into smaller subcomponents."

Gives a three-question test for what is *not* state (unchanged over time / passed in as
a prop / computable from existing state or props), and a three-step procedure for where
state lives: find every component that renders from it → find their closest common
parent → put it there or above.

### [3] Next.js — Project structure and organization
<https://nextjs.org/docs/app/getting-started/project-structure>

Backs [nextjs.md](./nextjs.md). The most important thing on this page is how little it
prescribes:

> "Next.js is **unopinionated** about how you organize and colocate your project files."

> "The simplest takeaway is to choose a strategy that works for you and your team and be
> consistent across the project."

It names three strategies: project files outside `app`, in top-level folders inside
`app`, or split by feature/route. It also states two facts that correct a common
misreading:

> "a route is **not publicly accessible** until a `page.js` or `route.js` file is added
> to a route segment"

> "Since files in the `app` directory can be safely colocated by default, private
> folders are not required for colocation."

Private folders (`_folder`) are therefore an organizational choice, not a requirement.
The page lists their real benefits: separating UI from routing logic, consistency,
editor sorting, and avoiding collisions with future Next.js file conventions.

### [4] Vercel — How we optimized package imports in Next.js
<https://vercel.com/blog/how-we-optimized-package-imports-in-next-js>

Backs the barrel-file rule in [folders.md](./folders.md). Critically, it bounds what the
framework will do for you:

`optimizePackageImports` analyzes the entry file of an **external npm package**, detects
a barrel, and rewrites imports past it. It applies **only to `node_modules`** and must
be configured per package — it does nothing for your own internal `index.ts` barrels.

Measured: 15–70% dev-time improvement per library (`@mui/material` 7.1s → 2.9s), ~28%
faster production builds, up to 40% faster serverless cold starts.

---

### Architecture methodologies

### [5] Bulletproof React — project-structure.md
<https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md>

Backs the dependency-direction rule in [folders.md](./folders.md).

Prescribes `src/{app,assets,components,config,features,hooks,lib,stores,testing,types,utils}`
and, per feature, `features/<name>/{api,assets,components,hooks,stores,types,utils}`.

The load-bearing rule is unidirectional flow — **`shared → features → app`**. Features
must not import from other features; compose them at the app layer instead. It supplies
`import/no-restricted-paths` ESLint config to enforce this mechanically rather than by
convention.

**It explicitly advises against barrel files**, on tree-shaking and performance grounds,
and recommends direct imports. Worth noting because the repo pattern it is most often
cited to justify (a per-feature `index.ts`) is the opposite of what it says.

### [6] Feature-Sliced Design
<https://feature-sliced.design/docs/get-started/overview>

Backs the layering vocabulary in [folders.md](./folders.md). Layers, top to bottom: App,
Processes (deprecated), Pages, Widgets, Features, Entities, Shared. Layers hold slices
(business domains); slices hold segments (`ui`, `api`, `model`, `lib`, `config`).

> "Modules on one layer can only know about and import from modules from the layers
> strictly below."

> "Slices cannot use other slices on the same layer, and that helps with high cohesion
> and low coupling."

The strictest of the sources here. Cited for its dependency rules, not as a mandate to
adopt the full seven-layer taxonomy.

---

### Practitioner essays

### [7] Kent C. Dodds — State Colocation will make your React app faster
<https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster>

**No longer cited directly.** State lifting and placement moved to
[react-best-practices](../react-best-practices/SKILL.md) §State Management in the v1.0.0
rewrite. Its underlying principle still shapes this skill's colocation stance in
[folders.md](./folders.md), which cites [9] for the same idea applied to files.

> "Place code as close to where it's relevant as possible."

Rule for lifting: if one component uses the state, keep it there; if several do, lift to
their least common ancestor — and no further. Benefits are both maintenance (related
code stays together) and performance (fewer components re-render).

### [8] TkDodo — Please Stop Using Barrel Files
<https://tkdodo.eu/blog/please-stop-using-barrel-files>

Backs the barrel-file rule in [folders.md](./folders.md). Two concrete costs:

1. **Circular imports** — a sibling importing through the barrel creates a cycle
   (`tab-panel.ts` → `index.ts` → `tab-panel.ts`). Tolerated by JS, but bundlers fail
   with cryptic errors.
2. **Dev speed** — importing one symbol loads every module the barrel re-exports,
   synchronously. Measured on a Next.js app: pages loading 11k modules and taking 5–10s
   to start, reduced to ~3.5k modules (**−68%**) by removing internal barrels.

States the one exception plainly: barrels make sense **when writing a library**, which
needs a single entry point. Application code should avoid them.

### [9] Robin Wieruch — React Folder Structure Best Practices
<https://www.robinwieruch.de/react-folder-structure/>

Backs the "structure earns its complexity" stance in [folders.md](./folders.md).

Six stages: single file → multiple files → folder per component → technical folders
(`components/`, `hooks/`, `utils/`) → feature folders → domain folders. You advance when
the current stage hurts: a file grows unwieldy, a component gets a second consumer, the
`components/` folder becomes hard to scan.

Favours feature folders over purely technical ones, but keeps technical folders for
genuinely shared code. Its useful test: once a utility is tightly coupled to a feature,
it moves into that feature.

### [10] Felix Gerschau — Separation of concerns with React hooks
<https://felixgerschau.com/react-hooks-separation-of-concerns/>

Backs the domain-vs-application split and the extraction-needs-a-trigger rule in
[logic.md](./logic.md). State, handlers, and
orchestration go in the hook; JSX stays in the component; genuinely pure calculations
become standalone framework-agnostic functions that are testable without React.

Includes its own brake, which this skill adopts:

> "Try to be pragmatic. If a component has only a few lines of JS, it's not necessary to
> separate the logic."

---

## Consulted, not cited

Surfaced during research on 2026-08-02 and deliberately left out. Recorded so a later
reader knows these were seen and judged, not missed.

**Unreachable at verification time**

- profy.dev — "React Folder Structures and Screaming Architecture"
  (`https://profy.dev/article/react-folder-structure`)
- profy.dev — "Path To A Clean(er) React Architecture: Business Logic Separation"
  (`https://profy.dev/article/react-architecture-business-logic-and-dependency-injection`)

Both looked directly relevant, but the host failed to resolve (`ENOTFOUND profy.dev`).
Nothing in this skill should rest on a page that was not actually read. Worth revisiting
if the site returns.

**Restated the primary sources without adding anything**

Search results that duplicated [3], [5], [6], or [9] — secondary write-ups of
feature-sliced structure, Next.js folder conventions, and RSC patterns from Medium,
DEV.to, and similar aggregators. Citing a summary of a primary source adds a link and
subtracts accuracy.

**Out of scope by design**

- Sources on React correctness (effects, memoization, keys) beyond [1] and [2] — that
  territory belongs to [react-best-practices](../react-best-practices/SKILL.md).
- Sources on Next.js framework mechanics beyond [3] and [4] — that territory belongs to
  [next-best-practices](../next-best-practices/SKILL.md).

## Internal references

Repo files this skill depends on or defers to.

| File | Relationship |
|---|---|
| [`react-best-practices/SKILL.md`](../react-best-practices/SKILL.md) | Owns how code is written. Its §Code Organization defers here. |
| [`next-best-practices/SKILL.md`](../next-best-practices/SKILL.md) | Owns framework mechanics — `file-conventions.md`, `rsc-boundaries.md` |
| [`.claude/skills/README.md`](../README.md) | Skill catalog and the `SKILL.md` / `examples.md` / sources anatomy |
| Root `CLAUDE.md` | House voice for rules; the `@devdigest/shared` two-copy rule |
| `client/CLAUDE.md`, `client/INSIGHTS.md` | Package conventions and recorded traps |

Client paths that [in-this-repo.md](./in-this-repo.md) verifies its claims against —
re-check these if the tree moves:

`client/src/app/**/_components/`, `client/src/components/`, `client/src/vendor/ui/`,
`client/src/vendor/shared/`, `client/src/lib/hooks/`, `client/src/lib/api.ts`,
`client/messages/en/`.

**Tooling.** The `skill-creator@claude-plugins-official` plugin supplied the authoring
patterns used here — progressive disclosure, the read-when guidance in
[SKILL.md](./SKILL.md), and the frontmatter constraint that a version must live under
`metadata` rather than a top-level `version:` key, since its validator rejects unknown
top-level fields.

---

## Where the sources disagree

The disagreements are where this skill has to take a position rather than report one.

### Barrel files: banned, or the house style?

[8] and [5] both say avoid `index.ts` re-export barrels in application code, with
measurements behind it. [4] confirms the framework will not rescue you — its optimizer
only touches `node_modules`.

**Position taken:** avoid barrels for anything wide (a `components/` root, a feature
root). A barrel over a *single small component folder* — three or four files that are
always imported together — costs little and buys a stable import path. See
[folders.md](./folders.md).

This is a live question in this repo, not a hypothetical: `run-cost-badge/index.ts` and
`findings-badge/index.ts` are exactly this pattern. Under the position above they are
fine, because each re-exports one component's own files, not a directory of unrelated
modules. [in-this-repo.md](./in-this-repo.md) says so explicitly rather than leaving it
ambiguous.

### How much structure, and when?

[6] prescribes a full taxonomy up front. [9] says grow into it and let pain drive each
step. [3] declines to prescribe at all and asks only for consistency.

**Position taken:** [9]'s progression as the default, [6]'s *dependency rules* adopted
from the start. Direction of imports is cheap to maintain early and expensive to
retrofit; folder taxonomy is the reverse.

### How aggressively to extract logic

[10] extracts state and handlers into hooks, then immediately warns against doing it to
small components. [5] and [6] push structural separation much further.

**Position taken:** [10]'s pragmatism. Extraction needs a trigger — a second consumer, a
test that is awkward to write, or a component body long enough to hide its own JSX.
Extraction without a trigger is the premature-abstraction anti-pattern
[react-best-practices](../react-best-practices/SKILL.md) already flags.

---

## Changelog

### 1.0.0 — 2026-08-02

Narrowed the skill to placement and organization only.

- **Removed everything the neighbour skills already own** — roughly 40% of the body.
  Derive-don't-store, `useEffect` rules, state lifting, Context, data-fetching mechanics,
  render factories, keys, conditional rendering, prop and composition rules went to
  [react-best-practices](../react-best-practices/SKILL.md); serializable props and route
  group / private folder mechanics went to
  [next-best-practices](../next-best-practices/SKILL.md). Each cut left a scope note
  naming its new owner, so nothing disappeared silently.
- **Added the placement guidance that was missing** — where an extracted component goes,
  and which file each kind of logic lands in. That question was previously buried under
  the React rules.
- **Added authoring hygiene** — `metadata.version`, read-when triggers on every topic
  section in [SKILL.md](./SKILL.md), and this full link inventory.
- **Renamed `references.md` → `README.md`.** Note this diverges from the anatomy in
  [`.claude/skills/README.md`](../README.md), which names `references.md` for this role;
  `security/` still follows the older convention.
- Sources [1] and [7] are retained but no longer cited — the rules they backed moved to
  `react-best-practices`.
