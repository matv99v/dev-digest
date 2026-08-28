# DevDigest

Local-first AI pull-request review: import a PR, run an agent review on it.

Under active development. `server/src/db/schema/` declares **every** table (unused ones
sit empty on purpose) and `reviewer-core` exposes prompt slots nothing feeds yet.
**Don't delete these as dead code, and don't build them out speculatively.**

## Before answering

A package's `README.md`, `docs/`, `specs/` and `INSIGHTS.md` are curated and may already
answer the question. Check the relevant one in *Where to look* **first** — don't
rediscover from source what someone already wrote down.

## Repo shape

Four standalone packages: `client/`, `server/`, `reviewer-core/`, `e2e/`.

- **Not a workspace.** There is no root `package.json`; code is shared through tsconfig
  path aliases. Run every command from inside its own package directory.
- **The package manager differs per package:**
  - pnpm — `server`, `client`
  - npm — `reviewer-core`, `e2e`
  - Mixing them breaks `--frozen-lockfile` in CI.
- Prerequisites: Node ≥22, pnpm ≥10, Docker (Postgres only).

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

- Edit `server/clones/**` — git-ignored runtime data.
- Edit `src/vendor/**` in place — vendored; extend it instead.
- Edit a `db/migrations/*.sql` after it has merged — add a new migration.
- Run `docker compose down -v` — `-v` destroys the `devdigest_pgdata` volume along with
  every repo and review already imported.

## Where to look

- architecture, API map, routes, what works today → `README.md`
- testing strategy and CI → `TESTING.md`
- writing an agent's system prompt → `docs/agent-prompts/README.md`
- gotchas already hit here → `INSIGHTS.md`
- planning a feature → `specs/`
- working inside a package → its own `CLAUDE.md` loads automatically. Its `docs/`,
  `specs/` and `INSIGHTS.md` do **not** — open them yourself.
