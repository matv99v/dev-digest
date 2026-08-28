# server — `@devdigest/api`

Fastify 5 + Drizzle/Postgres (pgvector), on :3001. Uses **pnpm**.

## Before answering

Search `server/docs/`, `server/specs/` and `server/INSIGHTS.md` for the topic **before**
reading source. They are curated and may already answer it.

## Commands

- `pnpm dev` — tsx watch
- `pnpm typecheck`
- `pnpm db:migrate` — manual; **never runs on boot**
- `pnpm db:seed` — idempotent demo data
- Unit tests — `pnpm exec vitest run --exclude '**/*.it.test.ts'` (hermetic, no Docker)
- Integration tests — `pnpm exec vitest run .it.test` (needs Docker)

The test split is spelled out because no `test:*` scripts exist: `package.json` is
`skip-worktree`.

## Invariants

Hold these when adding code. Breaking one still compiles.

- **Multi-tenancy.** Every domain table carries `workspaceId`. Resolve tenancy with
  `getContext(container, req)` (`src/modules/_shared/context.ts`) and scope every query
  by it — an unscoped query leaks across workspaces.
- **`repo-intel` is reached only through the facade** `container.repoIntel.*`. Never
  import the pipeline internals directly.
- **Context enrichment is best-effort.** If a repo is unindexed or a lookup fails, omit
  that prompt section — don't throw, or reviews break for unindexed repos.
- **Secrets** live in `~/.devdigest/secrets.json` (mode `0600`) — never in git, never in
  the database. `LocalSecretsProvider` is the one read chokepoint.
- **Prompt-injection defense is one shared `INJECTION_GUARD` rule**, deliberately not
  keyword scanning — a denylist only ever catches one phrasing. Don't add one.

## Conventions

- A DB-backed test **must** be named `*.it.test.ts`, or it silently breaks the unit /
  integration split above.
- Relative imports carry **explicit `.js` extensions** even though the sources are `.ts`.
- Single quotes here; the client uses double.

## Never

- Edit `clones/` — git-ignored runtime data.
- Edit a `db/migrations/*.sql` after it has merged — add a new migration.
- Edit `src/vendor/shared` in place — it is the **canonical** contracts copy. Add new
  files instead.

## Where to look

- request/DI flow, API map → `README.md`
- the codebase indexer → `src/modules/repo-intel/README.md`
- testing strategy and CI → `../TESTING.md`
- gotchas already hit here → `INSIGHTS.md`
- design decisions → `docs/`
- planning a feature → `specs/`
