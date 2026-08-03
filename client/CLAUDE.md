# `@devdigest/web` — the studio (Next.js 15 App Router)

## Source of truth

Read this folder's `docs/`, then `README.md`, before the code. Repo-wide rules
live in the root `CLAUDE.md`.

## Read when

**When a trigger applies, read its document before acting** — never up front.

| Trigger | Read |
|---|---|
| Anything breaks non-obviously in this package | `INSIGHTS.md` |
| Routes, components, data hooks, the API surface each page uses | `README.md` |
| Starting a feature here — check for an existing spec first | `specs/` |
| Reaching for a UI primitive, chart, or app-shell piece | `src/vendor/ui/README.md` |

## Gotchas

- **i18n messages load from `process.cwd()/messages`** via `readdirSync`, so the
  app is cwd-sensitive at runtime and every namespace ships on every request.
