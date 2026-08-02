---
name: frontend-ui-architecture
description: "Frontend code organization for React and Next.js — where components, constants, helpers, and business logic belong, when to split a component and where the pieces go, folder structure and colocation, import direction, barrel files, and how the server/client boundary constrains placement. Use when deciding where new code should live, structuring a feature, splitting an oversized component, or reviewing a PR for file organization."
metadata:
  version: 1.0.0
---

# Frontend UI Architecture

Answers one question: **where does this code go?**

This skill owns *placement and organization only*. Two neighbours own the rest, and this
skill never restates them:

| Question | Skill |
|---|---|
| How should this code be written? Hooks, state, keys, memoization, accessibility | [react-best-practices](../react-best-practices/SKILL.md) |
| What does the framework require? Special files, route groups, RSC rules, metadata | [next-best-practices](../next-best-practices/SKILL.md) |
| **Where does this file go, and how is it split?** | this skill |

Each topic file below repeats that boundary in a scope note, so a reader who lands
mid-skill knows what is deliberately missing.

## Severity levels

Every rule heading in the topic files carries a tier. It says what a violation costs, so a
reviewer can tell a structural break from a preference:

- **CRITICAL** — breaks an invariant the codebase holds everywhere: import direction
  (cross-feature imports, shared code importing feature code), HTTP or React leaking across
  the layer boundary, and anything that moves a client-only dependency or a secret across the
  server/client line. These block a PR (`pr-self-review`).
- **HIGH** — a real defect or drift that is expensive to reverse once importers exist.
- **MEDIUM** — consistency and reviewability; worth fixing, never worth blocking on.

## Folders, colocation, and imports

**Read when** adding a file and unsure where it belongs, promoting something to shared,
setting up a new area of the codebase, or reviewing an import that feels wrong.

See [folders.md](./folders.md) for:
- Colocating by default, and the one trigger that moves a file out
- Letting structure earn its complexity — the staged progression
- Dependency direction (`shared → features → app`) and enforcing it with ESLint
- Barrel files: the measured cost, and the one narrow case that is fine
- Naming, and a four-step test for where a new file goes

## Splitting components

**Read when** a component feels too big, or you have decided to split one and need to
know which folder each half lands in.

See [components.md](./components.md) for:
- The signals that a split is due, and why line counts are not one
- Where the extracted component goes — parent folder, feature, or shared
- Symptoms of a split in the wrong place

## Where business logic lives

**Read when** logic is piling up in a component body, or you are deciding between a
helper, a hook, and leaving it where it is.

See [logic.md](./logic.md) for:
- Domain / application / presentational logic, and the file each one lands in
- Why extraction needs a trigger, and what premature extraction costs
- Where the extracted logic goes, and keeping the domain layer free of React

## Constants, helpers, and utilities

**Read when** naming a magic value, or deciding between `helpers`, `utils`, and `lib`.

See [constants-and-helpers.md](./constants-and-helpers.md) for:
- What earns a name, and the scoping ladder from local to shared
- `helpers` vs `utils` vs `lib` — a definition that holds
- Helper purity and naming; type colocation

## Next.js App Router organization

**Read when** starting a new route or feature in an App Router codebase, or deciding
whether something belongs inside `app/`.

See [nextjs.md](./nextjs.md) for:
- The three organization strategies Next.js names, and picking one
- Why colocation in `app/` is already safe, and what `_private` folders are really for
- The server/client boundary as a placement constraint
- Bundle discipline and the limits of `optimizePackageImports`

## In this repo

**Read when** working in DevDigest's `client/` — before proposing any structural change.

See [in-this-repo.md](./in-this-repo.md) for:
- Route-local `_components/` vs shared `src/components/`, and the promotion bar
- The per-component file convention (`constants.ts` / `helpers.ts` / `styles.ts`)
- Why the existing barrels here are the acceptable kind
- Inline `CSSProperties` styling — and where `react-best-practices` is wrong about it
- Data access through `lib/hooks/`, and the honest state of RSC usage

## Examples

**Read when** a rule above is clear but its application is not.

See [examples.md](./examples.md) for good/bad pairs covering placement decisions.

## Sources

See [README.md](./README.md) for every link behind this skill — the ten cited sources,
each fetched and quoted; what was consulted and rejected; and where the sources disagree
and the position this skill takes.
