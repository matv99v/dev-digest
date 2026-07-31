# `@devdigest/api` — Fastify API + Drizzle/Postgres, port 3001

## Source of truth

Read this folder's `docs/`, `specs/`, `INSIGHTS.md`, then `README.md`, before the
code. Repo-wide rules live in the root `CLAUDE.md`.

## Read when

| Trigger | Read |
|---|---|
| Anything breaks non-obviously in this package | `INSIGHTS.md` |
| Routes, DI container, adapters, DB schema, request flow | `README.md` |
| Starting a feature here — check for an existing spec first | `specs/` |
| Symbols, import graph, file rank, repo map | `src/modules/repo-intel/README.md` |
| Authoring or editing an agent's system prompt | `../docs/agent-prompts/README.md` |

## Gotchas

- **`clones/` currently holds a clone of this very repo.** Never write into it,
  run git commands against it, or let a repo-wide sweep reach it.
