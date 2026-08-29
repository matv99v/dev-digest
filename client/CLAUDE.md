# client — `@devdigest/web`

Next.js 15 (App Router) + React 19 + TanStack Query, on :3000. Uses **pnpm**.

## Before answering

Search `client/docs/`, `client/specs/` and `client/INSIGHTS.md` for the topic **before**
reading source. They are curated and may already answer it.

## Commands

- `pnpm dev` — next dev on :3000
- `pnpm typecheck`
- `pnpm test` — vitest + jsdom; `fetch` is mocked, so no API, DB or browser
- Needs `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`)

## Invariants

Hold these when adding code. Breaking one still compiles.

- **Types and contracts come from `@devdigest/shared`** (Zod) — never hand-duplicate
  one. Note that `src/vendor/shared` is a **copy of the server's canonical version and
  has already drifted** (5 files differ), so changing a contract means diffing both
  deliberately.
- **All API access goes through `src/lib/api.ts`**, wrapped in the hooks under
  `src/lib/hooks/`. Never call `fetch` from a component.
- **A new `@devdigest/ui` component must be added to the showcase**, or the gallery
  smoke test (`src/test/smoke.test.tsx`) fails CI from a directory you never touched.
- **Import from the `@devdigest/ui` barrel**, never from a layer file inside it.

## Conventions

- Styling is inline style objects keyed to CSS variables (`var(--accent)`), never
  hard-coded colors.
  - Keep them all-longhand: mixing `border` with `borderLeft` makes React warn on
    rerender.
  - Tailwind is installed but the components don't use it.
- **Double quotes** here; the server uses single.

## Never

- Edit `src/vendor/ui` or `src/vendor/shared` in place — vendored; extend them instead.
- Touch `.next/`.

## Use when

- UI route map → read `README.md`
- design-system primitives → read `src/vendor/ui/README.md`
- testing strategy and CI → read `../TESTING.md`
- gotchas already hit here → read `INSIGHTS.md`
- design decisions → read `docs/`
- planning a feature → read `specs/`
