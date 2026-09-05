# ui-architecture — notes and sources

Meta file for humans. Not loaded as skill context.

## Why this skill exists

`client/` already had a consistent architecture that nothing wrote down, so every session
reverse-engineered it from the files and drifted where it guessed. Two measurements taken
when this skill was written:

- **Imports:** 383 relative vs 30 aliased, with real cases reaching seven and eight levels
  up (`SettingsApiKeys.tsx` → `"../../../../../../../lib/types"`, `FindingCard.test.tsx` →
  `"../../../../../../../../messages/en/prReview.json"`).
- **Barrels:** 54 `index.ts` files in three incompatible shapes — `export *`, named +
  default re-export, and a curated public surface.

The frontend skills already installed leave this gap open: `react-best-practices` gives six
lines to "Code Organization" and never draws a tree, `next-best-practices` documents only
the framework's own `app/` conventions, `react-testing-library` covers test naming,
`typescript-expert` has four checklist bullets. None says where a constant, a helper, a type
or a shared component goes *in this repo*.

`onion-architecture` is the server-side counterpart. The two split at the package boundary.

## Structure

Progressive disclosure: the hub carries what almost every task needs, and each reference
file is loaded only when the task calls for it. The hub is 122 lines; the four references
add ~450 more that never enter context unless the task asks for them.

| File | Loaded | Holds |
|---|---|---|
| `SKILL.md` | when the skill triggers | Cross-skill routing, the placement table, the tree, the promotion rule, symptom→fix, and pointers to the rest |
| `references/structure-and-naming.md` | on demand | Component-folder vocabulary, naming tables, constants/helpers/utils, promotion ladder, size thresholds |
| `references/imports-and-barrels.md` | on demand | `@/` vs `./`, aliases, import direction, `index.ts` as public API |
| `references/splitting-components.md` | on demand | Split signals, composition, state placement, hook extraction, logic layering |
| `references/nextjs-placement.md` | on demand | Route files, private folders, route groups, the client boundary, new-route checklist |
| `examples.md` | on demand | Five before/after pairs and a full walkthrough |

Every reference is one level deep from `SKILL.md` and self-contained, so a partial read
never loses the thread.

## Version

| Version | Change |
|---|---|
| 1.2.0 | Merged the judgment material from the sibling `frontend-architecture` skill, rewritten against this repo's conventions: component split signals (and over-splitting signals), composition over prop flags, state colocation, hook extraction and the name test, the constants/helpers/utils distinction, folder size thresholds, route groups. Added naming rows for constants, types, booleans and handlers. |
| 1.1.0 | Restructured to hub + three reference files (progressive disclosure). `SKILL.md` dropped from 232 to 119 lines; the placement table, tree and promotion rule stay in the hub because nearly every task needs them, while naming, imports and Next.js placement load on demand. No rules changed. |
| 1.0.0 | Initial. Placement table, canonical tree, component-folder vocabulary, promotion rule, naming, import direction, barrels as public API, server/client boundary, symptom→fix, route checklist. |

## Evals

`evals/evals.json` holds the test prompts this skill is measured against, with
`evals/diff.patch` as the fixture for the review case. Not yet run.

## Sources

Every source below was read while writing this skill. The right column is what was taken
from it — the rest of each source is out of scope here.

| Source | Taken |
|---|---|
| [bulletproof-react — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | Feature-folder layout; unidirectional `shared → features → app`; no cross-feature imports; the caution about barrel files |
| [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) | Colocation inside `app/` is safe by default; `_private` folders opt out of routing; the three organisation strategies |
| [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | `"use client"` marks a module graph, not a file; push it to the leaves; pass Server Components as `children`; render providers deep |
| [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) | Layers may only import downward; segments (`ui` / `api` / `model` / `lib` / `config`); **public API via `index.ts`** |
| [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | "Place code as close to where it's relevant as possible"; the maintainability / applicability / ease-of-use argument; when *not* to colocate |
| [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | Lift to the least common parent, and push back down when a consumer disappears — the half nobody does |
| [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | One folder per component with its associated files; the graduation rule when a helper is needed elsewhere; helpers (project-specific) vs utils (generic) |
| [Dmitri Pavlutin — 7 Architectural Attributes of a Reliable React Component](https://dmitripavlutin.com/7-architectural-attributes-of-a-reliable-react-component/) | "One reason to change"; fetching and displaying as two independent axes; encapsulation through callback props rather than passing instances |
| [react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) | `use` prefix only when the function calls hooks; non-reactive logic is a plain function; avoid `useMount`-style lifecycle wrappers |
| [react.dev — Thinking in React](https://react.dev/learn/thinking-in-react) | Single-responsibility component splitting; component hierarchy mirroring the data model |
| [TkDodo — Component Composition is great btw](https://tkdodo.eu/blog/component-composition-is-great-btw) | Extract a layout component taking `children`; early returns over nested ternaries for mutually exclusive states |
| [Redux Style Guide](https://redux.js.org/style-guide/) | Feature folders with single-file logic; keep state minimal and derive the rest; structure state by data type, not by component |
| [Martin Fowler — PresentationDomainDataLayering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) | The domain must not depend on presentation; past a certain size, modularise by domain first and layer *within* each module |
| [Anthropic — Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | Progressive disclosure — hub under 500 lines, references one level deep, table of contents on longer files; third-person description carrying its own triggers; explain the reason instead of stacking imperatives |
