# DevDigest

Local-first AI pull-request review: import a PR, run an agent review on it.

Under active development. `server/src/db/schema/` declares **every** table (unused ones
sit empty on purpose) and `reviewer-core` exposes prompt slots nothing feeds yet.
**Don't delete these as dead code, and don't build them out speculatively.**

## Before answering

Read the `INSIGHTS.md` of the package you are about to work in **first** — it records
what already cost someone time there. Then check the rest of *Use when* for the topic.
Say in one line what you took from them before you start. Don't rediscover from source
what someone already wrote down.

## Repo shape

Four standalone packages: `client/`, `server/`, `reviewer-core/`, `e2e/`.

- **Not a workspace.** There is no root `package.json`; code is shared through tsconfig
  path aliases. Run every command from inside its own package directory.
- **The package manager differs per package:**
  - pnpm — `server`, `client`
  - npm — `reviewer-core`, `e2e`
  - Mixing them breaks `--frozen-lockfile` in CI.
- Prerequisites: Node ≥22, pnpm ≥10, Docker (Postgres only).
- **Agent instructions live in `AGENTS.md`.** The `CLAUDE.md` next to it in every package
  is a committed symlink (`CLAUDE.md -> AGENTS.md`) so Claude Code loads the same file —
  one source of truth, never a copy.

## Commands

- `./scripts/dev.sh` — the whole stack: Postgres + API :3001 + web :3000
  - flags: `--no-seed`, `--no-client`, `--db-only`
- `./scripts/e2e.sh` — hermetic e2e stack on alternate ports
- `cd server && pnpm db:migrate` — migrations **never run on boot**; run this yourself

## Gotchas

- `server/package.json` is **`skip-worktree`**: a local variant diverges from the
  committed file, so its scripts are not what actually runs. CI calls
  `pnpm exec vitest run …` directly instead.
- The server imports `reviewer-core`'s **raw `.ts`** at runtime via a tsconfig alias, so
  `reviewer-core/node_modules` must exist or the API dies at boot with
  `ERR_MODULE_NOT_FOUND`.
- A new path alias needs **two** edits — `tsconfig.json` *and* `vitest.config.ts` (there
  is no workspace resolver to inherit from). Sometimes a third: that workflow's `paths:`
  filter.
- **No linter or formatter exists.** Match the style of the file you are editing.

## Never

- Edit a `CLAUDE.md`, or replace one with a real file — they are symlinks. Edit the
  `AGENTS.md` they point at.
- Edit `server/clones/**` — git-ignored runtime data.
- Edit `src/vendor/**` in place — vendored; extend it instead.
- Edit a `db/migrations/*.sql` after it has merged — add a new migration.
- Run `docker compose down -v` — `-v` destroys the `devdigest_pgdata` volume along with
  every repo and review already imported.

## Before finishing

If the session produced a durable lesson — a non-obvious cause, a dead end, a correction
you had to be given — record it with `/engineering-insights`. If nothing was learned that
isn't already written down, record nothing.

## Use when

- architecture, API map, routes, what works today → read `README.md`
- testing strategy and CI → read `TESTING.md`
- writing an agent's system prompt → read `docs/agent-prompts/README.md`
- gotchas already hit here → read `INSIGHTS.md`
- planning a feature → read `specs/`
- working inside a package → its own `AGENTS.md` loads automatically. Its `docs/`,
  `specs/` and `INSIGHTS.md` do **not** — read them yourself.
