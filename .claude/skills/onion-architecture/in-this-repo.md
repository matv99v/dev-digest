# In this repo

DevDigest's actual backend state. Paths verified on **2026-08-02**; the deviations below
are recorded as debt, not precedent.

## Where the rings live

| Ring | Path |
|---|---|
| Contracts (core) | `server/src/vendor/shared/contracts/*.ts` — Zod, shared with the client |
| Ports | `server/src/vendor/shared/adapters.ts` — `LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `SecretsProvider`, `AuthProvider` |
| Error taxonomy | `server/src/platform/errors.ts` — `AppError` → `NotFoundError`, `ValidationError`, `ExternalServiceError`, `ConfigError` |
| Services | `server/src/modules/<name>/service.ts` |
| Repositories | `server/src/modules/<name>/repository.ts` |
| Adapters | `server/src/adapters/{llm,github,git,codeindex,astgrep,secrets,tokenizer,embedder,depgraph}/` |
| Mocks | `server/src/adapters/mocks.ts` |
| Composition root | `server/src/platform/container.ts` |
| Transport | `server/src/modules/<name>/routes.ts`, registered in `modules/index.ts` |

`@devdigest/shared` is **two copied directories, not a package** — the server's copy is
`server/src/vendor/shared/`. They have already drifted and nothing checks them. A port
or contract change must be made in both.

## The reference module

`server/src/modules/repos/` is what a compliant module looks like, and is the one to
copy from:

| File | Lines | Role |
|---|---|---|
| `routes.ts` | 48 | Four endpoints; resolves context, calls the service, sets status codes |
| `service.ts` | 144 | Add/list/refresh/remove plus the async clone job |
| `repository.ts` | 87 | Every `repos` query, each scoped by `workspaceId` |
| `helpers.ts` | 56 | `parseRepoUrl`, `withGitHubToken`, `toRepoDto` — pure |
| `constants.ts` | 24 | Job kinds, clone depth, secret key |

Its service header already states the rule this skill generalises: *"No HTTP and no raw
SQL live here — persistence goes through RepoRepository, pure transforms through
helpers.ts, literals through constants.ts."*

`server/src/modules/reviews/` is the reference for a module that outgrew one file per
ring: `repository.ts` stays the public class and composes `repository/review.repo.ts`,
`run.repo.ts`, `pull.repo.ts`, split by aggregate.

## Sanctioned exceptions

Things that look like violations, are deliberate, and should not be "fixed".

**`server/src/db/rows.ts` exports Drizzle row types for cross-module use.** Its own
header explains why: the types live next to the schema "so cross-cutting consumers can
reference a row shape WITHOUT importing another module's data layer. Each owning
repository re-exports its row from here to keep its public type API unchanged." Sharing
a generated type is a much smaller coupling than importing a sibling's `repository.ts`.
The query language still stays inside repositories — that is the boundary that matters.

**Services take the whole `Container`.** Consistent across every module. Discussed in
[ports-adapters.md](./ports-adapters.md); the invariant that survives is that the
container hands out port interfaces, so services still depend on abstractions.

**`platform/` contains both core and infrastructure.** `errors.ts` and `config.ts` are
core; `sse.ts`, `jobs.ts`, and `run-logger.ts` are infrastructure that happens to be
shared. Judge a `platform/` file by its imports, not its folder.

## Known deviations

Each of these is a leak with a mechanical fix. They are listed so the next module does
not copy them.

**1. Routes importing the ORM.** Four transport files compose queries directly:

- `modules/pulls/routes.ts:3` — 363 lines, with `db.insert` at `:223` and `:235` and
  `db.select` at `:260`, `:261`, `:303`. The module has **no** `service.ts` and **no**
  `repository.ts`; the `pull_requests`, `pr_files`, and `pr_commits` tables currently
  have no owner. The largest single piece of debt here.
- `modules/settings/routes.ts:3`
- `modules/polling/routes.ts:3`
- `modules/workspace/routes.ts:2` — and this one queries `t.repos`, a table owned by
  `modules/repos/repository.ts`. It re-implements `RepoRepository.list(workspaceId)`
  inline, so the tenancy filter now exists in two places.

Also `modules/settings/feature-models.ts:1`, which is application-ring rather than
transport but has the same problem.

**2. Modules importing adapters directly**, bypassing the container and therefore
`ContainerOverrides`:

- `modules/repo-intel/service.ts:22` → `adapters/codeindex/extract.js`
- `modules/repo-intel/service.ts:28` → `adapters/astgrep/index.js`
- `modules/reviews/diff-loader.ts:3` → `adapters/git/diff-parser.js`

Worth noting for calibration: all three import **pure functions**, not stateful clients
— by the interface test in [ports-adapters.md](./ports-adapters.md) these are helpers
that happen to live under `adapters/`. The honest fix is to move them out of `adapters/`
rather than to invent ports for them.

**3. No architecture check.** `dependency-cruiser@17` is a dependency but no config
exists. [enforcement.md](./enforcement.md) has the file ready.

## Settled vs open

**Settled** — port-first for new external dependencies; the container as the only place
adapters are constructed; repositories owning tables and scoping by `workspaceId`;
`*.it.test.ts` for anything touching the DB; Zod contracts as the HTTP boundary in both
directions.

**Open** — whether services should take explicit ports instead of the container;
whether `platform/` should split into core and infrastructure folders; whether to turn
on `arch:check` before or after paying down the deviations above. None of these blocks
new work: follow the settled conventions and leave the open ones alone.
