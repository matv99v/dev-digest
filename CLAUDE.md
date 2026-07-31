# DevDigest — local-first AI pull-request review

import a PR → run an agent review. Four standalone packages, **no monorepo workspace** —
`server/` (Fastify API), `client/` (Next.js studio), `reviewer-core/` (pure review engine), `e2e/`.

## Source of truth

Read `docs/`, then `README.md`, **before** the codebase — they hold the *why*,
which the source cannot show. Code wins on *what it does today*; when they
disagree the doc is stale, so fix it in the same change.

## Read when

**When a trigger applies, read its document before acting** — never up front.

| Trigger | Read |
|---|---|
| Anything breaks non-obviously; before changing infra, boot, or env | `INSIGHTS.md` |
| Running the stack from zero; overall architecture and data flow | `README.md` |
| Starting a feature — check for an existing spec first | `specs/` |
| Working inside a package | that package's own `CLAUDE.md` — `server/`, `client/`, `reviewer-core/`, `e2e/` |
| Authoring or editing an agent's system prompt | `docs/agent-prompts/README.md` |

## Conventions

- **Package managers differ per package.** `server/`+`client/` use pnpm,
  `reviewer-core/`+`e2e/` use npm. Never mix lockfiles.
- **`@devdigest/shared` is two copied directories**, not a package. They have
  already drifted and nothing checks them — edit both when you change a contract.
- **Cross-package imports resolve to raw `src/`** via tsconfig aliases, never
  build output. Nothing here is published or emitted.
- **Empty tables, unused i18n namespaces, and vendored UI are placeholders for
  features not yet built**, not dead code. Do not delete them to "clean up".

## Gotchas

- **Never hand-edit `~/.devdigest/secrets.json` while the API runs.**
  `LocalSecretsProvider` caches it in memory and `set()` writes that stale cache
  back — your edit is silently overwritten. Restart, or use the Settings UI.
- **Generated — regenerate, never hand-edit.** `server/src/db/migrations/` + its
  `meta/` snapshots (`pnpm db:generate`) and `skills-lock.json`. Editing an
  applied migration won't re-run it — the DB silently keeps the old shape.
