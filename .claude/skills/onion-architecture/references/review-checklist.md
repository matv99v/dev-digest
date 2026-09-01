# Review checklist

Read this when reviewing a backend diff, or when you suspect a piece of code is in the
wrong layer. Paths are relative to `server/`.

## Contents

- [The seven checks](#the-seven-checks)
- [Anti-patterns, with the real examples](#anti-patterns-with-the-real-examples)
- [Known violations in the tree today](#known-violations-in-the-tree-today)
- [Looks like a violation, isn't](#looks-like-a-violation-isnt)
- [How to phrase a finding](#how-to-phrase-a-finding)

## The seven checks

Run these against any diff touching `src/`:

1. **Does a `routes.ts` import `drizzle-orm` or `db/schema.js`?** → SQL belongs in
   `repository.ts`.
2. **Does a handler touch `container.db`, `container.git`, `container.github()`,
   `container.llm()`, `container.secrets`?** → those are adapters; a route calls its
   service, the service calls the adapter. `getContext(container, req)` is the exception —
   that's the auth port, and every route needs it.
3. **Does a `service.ts` import `fastify`, `FastifyRequest` or `FastifyReply`?** → the
   service should take plain values. Pull what it needs out in the route.
4. **Does a `service.ts` import a concrete adapter class** from `src/adapters/`? → depend on
   the port type and resolve through the container.
5. **Does a `repository.ts` take `Container` or `FastifyInstance`?** → it takes `Db`.
6. **Is every query scoped by `workspaceId`?** → a `server/AGENTS.md` invariant, and the
   reason repositories exist at all. An unscoped query leaks across workspaces and still
   compiles.
7. **Is the new external effect reachable through `ContainerOverrides`?** → if not, no test
   can replace it, and it was wired in the wrong place.

Two more worth a glance:

- A `helpers.ts` that `await`s I/O is no longer a helper.
- A route doing slow work inline (a clone, a full index, an LLM call) should be enqueueing
  a job instead — see `RepoService`'s `clone` handler.

## Anti-patterns, with the real examples

### Drizzle in the handler

```ts
// modules/pulls/routes.ts:28 — don't
const [repo] = await container.db
  .select().from(t.repos)
  .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
```

```ts
// modules/repos/repository.ts — do
async findById(workspaceId: string, id: string): Promise<RepoRow | undefined> { … }
```

The query itself is fine. Its location means the tenancy guard is now enforced in as many
places as there are handlers.

### Adapter resolved in the handler

```ts
// modules/pulls/routes.ts:36 — don't
const gh = await container.github();
```

Once the route holds the adapter, the decisions that follow (sync or serve stale? fail or
warn?) end up in the route too — which is exactly what happened there.

### N+1 at the edge

`modules/pulls/routes.ts:89-96` declares `BACKFILL_LIMIT = 10`, slices the list to it, then
loops per-PR `getPullRequest` calls inside the handler. In a service that's a batching
decision with a name; in a handler it's a magic constant nobody will find.

### A route that owns a workflow

`modules/pulls/routes.ts` `GET /repos/:id/pulls` is ~145 lines: read repo, resolve GitHub
client, list PRs, upsert each, backfill details, read reviews, aggregate status. That's a
use case, and its natural home is `PullsService.listForRepo(workspaceId, repoId)`.

### Repository with a wide dependency

A repository constructed from `FastifyInstance` or `Container` can reach every adapter, so
nothing stops a network call appearing inside a data-access class. `RepoRepository(private
db: Db)` can't. (The `fastify-best-practices` skill teaches the wide version — this repo
does not follow it.)

### Interface with one implementation and no inversion

Wrapping an internal class in an interface "for testability" when nothing substitutes it
adds a file and buys nothing. A port earns its keep when there's a second implementation —
and for anything doing real I/O, the fake in `adapters/mocks.ts` is that second
implementation.

## Known violations in the tree today

These predate the rule. Don't copy them; fixing them is a separate, deliberate task.

| File | What |
|---|---|
| `src/modules/pulls/routes.ts` | worst case — `drizzle-orm` at :3, `db/schema.js` at :6, `container.db` at :28, :47, :80, :97, :121, :173, :180, :193-:217, :232-:233, :270-:275, `container.github()` at :36, :190, :288, :311, N+1 backfill loop at :89-96. No `service.ts` or `repository.ts` exists for this module |
| `src/modules/settings/routes.ts` | `container.db` at :30, :53, :61; `container.github()` at :87; `container.llm()` at :91 |
| `src/modules/polling/routes.ts` | `container.db` at :22, :32, :60; `container.github()` at :28 |
| `src/modules/workspace/routes.ts` | `container.db` at :18 |

Modules that get it right, in rough order of usefulness as a template:
`modules/repos/` (smallest complete example — routes, service, repository, helpers,
constants), `modules/agents/`, `modules/reviews/` (large: split repositories plus a
`run-executor`), `modules/repo-intel/` (facade over a pipeline).

## Looks like a violation, isn't

- **The SSE generator inline in `modules/reviews/routes.ts:48-92`.** It bridges
  `container.runBus` to an async iterator. That is transport plumbing, and transport is
  what a route is for. There is no business decision in it.
- **`container.repoIntel.getIndexState(...)` called from `modules/repo-intel/routes.ts:39`.**
  `RepoIntel` *is* the port; the facade is the sanctioned boundary (`server/AGENTS.md`:
  "reached only through the facade `container.repoIntel.*`"). Reaching into the pipeline
  internals would be the violation.
- **`getContext(container, req)` in every route.** The auth port in use.
- **A read-only endpoint going route → repository with no service.** Fine while the body is
  one scoped select and there is no branching. Add the service when a second caller or a
  decision appears.
- **A service using Drizzle row types.** Deliberate. This is a pragmatic onion; there are no
  domain entities with mappers.
- **`db/schema/` tables nothing queries.** Declared on purpose (`AGENTS.md`) — not dead code,
  and not an invitation to build layers around them.

## How to phrase a finding

Name the layer, not the style. "This handler owns a use case — move the sync + upsert into
`PullsService` and the queries into `PullsRepository`" is actionable. "This is too long" is
not. Point at `modules/repos/` as the shape to copy; it's the shortest complete example in
the tree.
