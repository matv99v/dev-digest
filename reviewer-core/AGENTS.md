# reviewer-core — `@devdigest/reviewer-core`

The review engine: diff → prompt → LLM → grounded findings.

## Before answering

Read `reviewer-core/INSIGHTS.md` first — it records what already cost someone time here
— then `reviewer-core/docs/` and `reviewer-core/specs/` for the topic. Say in one line
what you took from them before you start.

## Commands

Uses **npm, not pnpm** (the server and client use pnpm).

- `npm ci`
- `npm test` — vitest; the LLM is stubbed, so no keys and no network
- `npm run typecheck` — identical to `npm run build`

## Invariants

Hold these when adding code. Breaking one still compiles.

- **No I/O.** No database, GitHub, filesystem, or persistence. The only side effect is
  an LLM call through an *injected* `LLMProvider`, and that purity is what keeps the
  package mock-testable.
- **The grounding gate is mandatory.** A finding that doesn't cite a line present in the
  diff is dropped, and the score is recomputed from the survivors —
  `scoreFromFindings(ground.kept)`. The model's self-reported score is ignored.
- **`skills`, `memory` and `specs` arrive as already-resolved strings.** Turning a skill
  slug into its body is the *caller's* job (the DB, in the server) — never the engine's.
- **`src/index.ts` is the only public surface.** Add exports there.

## Conventions

- `npm run build` is a type-check — the package **never emits JS**. The server consumes
  this raw `.ts` through an alias, so a breaking change lands there immediately, with no
  build step in between.
- Relative imports carry **explicit `.js` extensions** even though the sources are `.ts`
  — same as `server/`, unlike `client/`.
- `@devdigest/shared` resolves to `../server/src/vendor/shared`. The contracts are
  borrowed from the server, not owned here.

## Use when

- the review pipeline → read `README.md`
- gotchas already hit here → read `INSIGHTS.md`
- design decisions → read `docs/`
- planning a feature → read `specs/`
