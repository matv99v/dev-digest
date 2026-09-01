# The layers, in real paths

Read this when you're adding an endpoint or you're unsure which file a piece of code
belongs in. Everything here refers to `server/src/`.

## Contents

- [Ring by ring](#ring-by-ring)
- [Worked example: a new endpoint](#worked-example-a-new-endpoint)
- [Cross-module access](#cross-module-access)
- [Background jobs](#background-jobs)
- [Errors across layers](#errors-across-layers)

## Ring by ring

### Ring 0 — pure core (no I/O, no framework)

| Path | What lives there |
|---|---|
| `vendor/shared/contracts/*` | the zod contracts client and server both speak |
| `modules/<f>/helpers.ts` | pure transforms — `parseRepoUrl`, `toRepoDto` |
| `modules/<f>/constants.ts` | job kinds, clone depth, secret key names |
| `modules/pulls/status.ts` | `deriveReviewStatus` — a pure derivation, correctly separated even though the rest of that module isn't |
| `platform/errors.ts` | the error taxonomy every layer throws |
| `reviewer-core/src/**` | the review engine. Out of scope for this skill, but it is the innermost ring: its `AGENTS.md` says "No I/O … the only side effect is an LLM call through an *injected* `LLMProvider`". Never add an import with I/O to it |

A file in ring 0 should be testable by calling it with plain values. `test/pulls-status.test.ts`
and `test/reviews-helpers.test.ts` are what that looks like.

A **type-only** import of a Drizzle row is still ring 0 — `toRepoDto` in
`modules/repos/helpers.ts` takes `typeof t.repos.$inferSelect` and returns the `Repo`
contract. That's the pragmatic onion working as intended: the row type is a shape, not a
dependency. Importing the `db` *client* into a helper is the line that gets crossed.

### Ring 1 — ports (interfaces only)

`vendor/shared/adapters.ts` declares `LLMProvider`, `Embedder`, `GitHubClient`,
`GitClient`, `CodeIndex`, `AuthProvider`, `SecretsProvider`, plus the request/result
shapes they exchange.

Two more ports live beside their adapters because nothing outside the server speaks them:
`DepGraph` (`adapters/depgraph/index.ts`) and `Tokenizer` (`adapters/tokenizer/index.ts`).
`RepoIntel` (`modules/repo-intel/types.ts`) is the same idea one level up — a facade port
over the whole indexer.

A port is named for the conversation, not the vendor. `GitClient` survives replacing
`simple-git`; `SimpleGitClient` doesn't.

### Ring 2 — application

`modules/<f>/service.ts` holds the use case: resolve tenancy, validate business rules,
call repositories and ports in order, enqueue jobs, own the transaction. It takes the
`Container` in its constructor.

`modules/<f>/repository.ts` is the only place that queries its tables. It takes `Db`.
Every query is scoped by `workspaceId` — that's a `server/AGENTS.md` invariant, and
concentrating queries here is what makes it reviewable.

`modules/reviews/` splits further (`repository/pull.repo.ts`, `review.repo.ts`,
`run.repo.ts`, plus `run-executor.ts` and `diff-loader.ts`). Splitting a large service or
repository by entity is fine; the layer boundaries stay the same.

### Ring 3 — edge adapters

Driven (the app calls out) — every third-party tool in the backend enters through exactly
one of these:

| Tool / SDK | Port | Adapter |
|---|---|---|
| `@anthropic-ai/sdk`, `openai`, OpenRouter | `LLMProvider` | `adapters/llm/{anthropic,openai}.ts`; `OpenRouterProvider` lives in `reviewer-core` and is injected with the `PriceBook` |
| OpenAI embeddings | `Embedder` | `adapters/embedder/openai.ts` |
| `octokit` | `GitHubClient` | `adapters/github/octokit.ts` |
| `simple-git` | `GitClient` | `adapters/git/simple-git.ts` |
| `@vscode/ripgrep` (optional — falls back to a Node walk) | `CodeIndex` | `adapters/codeindex/ripgrep.ts` |
| `@ast-grep/napi` | internal | `adapters/astgrep/index.ts` |
| `dependency-cruiser` | `DepGraph` | `adapters/depgraph/index.ts` |
| `js-tiktoken` | `Tokenizer` | `adapters/tokenizer/index.ts` |
| `~/.devdigest/secrets.json` + `process.env` | `SecretsProvider` | `adapters/secrets/local.ts` |
| the workspace/user lookup | `AuthProvider` | `adapters/auth/local.ts` |
| `drizzle-orm` + `postgres` | — (repositories are the boundary) | `db/` |

If you're adding a tool and it doesn't fit a row above, you're adding a row — port first.

Driving (the world calls in): `modules/<f>/routes.ts`, and the SSE stream in
`modules/reviews/routes.ts`.

An adapter's job is translation, not decisions. `SimpleGitClient` knows about `--depth`,
three-dot vs two-dot diffs, and `GIT_TERMINAL_PROMPT=0`; it does not know what a review is.

### Composition root

`platform/container.ts` constructs adapters lazily and caches them; `app.ts` builds the
Fastify instance and does `app.decorate('container', container)`. This is the only place
that mentions a concrete adapter class by name.

`ContainerOverrides` is the test seam. Every port that a test might need to replace has a
key there.

## Worked example: a new endpoint

*"`GET /repos/:id/branches` — list the branches of a repo from GitHub."*

**1. Port** — does `GitHubClient` already have `listBranches`? If not, add it to the
interface in `vendor/shared/adapters.ts`, implement it in
`adapters/github/octokit.ts`, and add it to `MockGitHubClient` in `adapters/mocks.ts`.

**2. Contract** — if the response shape is new, add it to
`vendor/shared/contracts/` so the client can import the same type.

**3. Service** — a method on `RepoService`:

```ts
async listBranches(workspaceId: string, repoId: string): Promise<Branch[]> {
  const repo = await this.repo.findById(workspaceId, repoId);
  if (!repo) throw new NotFoundError('Repo not found');
  const gh = await this.container.github();
  return gh.listBranches({ owner: repo.owner, name: repo.name });
}
```

The service is the only thing that knows both "which repo row" and "which GitHub call".

**4. Repository** — add `findById` to `RepoRepository` if it isn't there, scoped by
`workspaceId`.

**5. Route** — thin:

```ts
app.get('/repos/:id/branches', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(container, req);
  return service.listBranches(workspaceId, req.params.id);
});
```

**6. Test** — `buildApp({ config, overrides: { github: new MockGitHubClient(...) } })`
and `app.inject()`. No network, no Docker.

Notice what the route does *not* do: no `container.github()`, no `container.db`, no
`try/catch` around the GitHub call deciding on a fallback. Those are decisions, and
decisions live in the service.

## Cross-module access

A module never imports another module's `repository.ts` directly. Shared repositories are
constructed in the composition root and reached through the container —
`container.agentsRepo`, `container.reviewRepo`, `container.repoIntel`. That keeps the set
of cross-module dependencies visible in one file instead of scattered through imports.

If two modules need the same logic and it is pure, it belongs in `helpers.ts` or
`vendor/shared/`. If it isn't pure, it needs a port or a shared repository on the container.

## Background jobs

An enqueued job is still application code — its handler belongs in `service.ts`, not in a
route and not in an adapter. `RepoService` registers the `clone` job handler and the handler
is where `container.secrets.get(...)` and `container.git.clone(...)` are called. The route
that triggered it returned long before.

This is also why routes must not do slow work inline: `POST /repos` returns 201 and enqueues;
it doesn't wait for a clone.

## Errors across layers

Throw the typed errors from `platform/errors.ts` (`NotFoundError`, `ConfigError`, `AppError`)
from wherever the condition is detected — the service usually. `app.ts` has a single error
handler that maps them to the `ApiErrorBody` envelope, so routes don't need `try/catch` to
shape a response.

Adapters throw their own failures; a service decides whether a failure is fatal or should
degrade. Context enrichment for reviews is best-effort by design (`server/AGENTS.md`) —
that decision lives in the service, not in the adapter that failed.
