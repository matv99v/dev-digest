# Rings and the module file set

## The four rings (CRITICAL)

Each ring is defined by what it may import. That is the whole definition — not the
folder name, not the file suffix. If a file's imports match a ring, it is in that ring
regardless of where it sits.

| Ring | Files | May import | May **not** import |
|---|---|---|---|
| Transport | `modules/<name>/routes.ts` | Fastify, Zod contracts, its own service, `_shared/` | Drizzle, `db/schema`, adapters, other modules' repositories |
| Application | `modules/<name>/service.ts` | its repository, port **types**, `platform/*`, helpers, constants | Fastify types, Drizzle, concrete adapter classes |
| Persistence | `modules/<name>/repository.ts` | Drizzle, `db/schema`, `db/rows`, contracts | Fastify, services, adapters |
| Core | contracts, `platform/errors.ts`, `helpers.ts`, `constants.ts` | other core files, `zod` | everything above |

Two things follow from the table that are worth stating outright, because both are
common mistakes:

**An outer ring may reach past its neighbour.** A route may import a contract or an
error class directly; it does not have to tunnel through the service. Allegro's write-up
puts it plainly: "every outer layer sees classes from all inner layers, not only the one
directly below" [5]. What is forbidden is the *inward* file importing outward, not the
outward file skipping a step.

**Types are not imports for this purpose.** A service naming `GitHubClient` in a
parameter type depends on the port, which lives in the core. A service writing
`new OctokitGitHubClient()` depends on the adapter, which does not. `import type` and
`import` differ in what they couple you to even though both are lines at the top of the
file.

## The module file set (HIGH)

A module is a folder under `server/src/modules/`. Files appear when there is content for
them — creating an empty `constants.ts` "for later" is the anti-pattern, and a module
with one query does not need five files to prove it is a module.

| File | Appears when | Holds |
|---|---|---|
| `routes.ts` | Always | The Fastify plugin: schema declaration, status codes, delegation |
| `service.ts` | There is a decision, a sequence, or an external call | Orchestration |
| `repository.ts` | The module owns tables | Every query against those tables |
| `helpers.ts` | Any pure function — even one | Parsing, mapping, calculation |
| `constants.ts` | Any literal used twice or worth naming once | Job kinds, limits, secret keys |

`routes.ts` is the only file that is always present, and the only one that knows HTTP
exists. Everything else is optional and earns its place.

### What belongs in `routes.ts` (HIGH)

Transport concerns only: declare the Zod `params`/`body`/`querystring` schema, resolve
request context, call one service method, map the result to a status code. Validation
runs before the handler via `fastify-type-provider-zod`, so a handler that calls
`Schema.parse(req.body)` is duplicating work the framework already did.

The size test is behavioural, not numeric: if you can describe the handler without using
a verb from the problem domain ("looks up the repo, then returns it"), it is transport.
If the description contains "and then", "unless", or "if it already exists", the logic
belongs one ring in.

### The failure to recognise on sight (CRITICAL)

```ts
// modules/<name>/routes.ts
import { and, eq } from 'drizzle-orm';           // ← transport importing the ORM
...
const rows = await container.db.select().from(t.prFiles).where(eq(t.prFiles.prId, id));
```

This is the violation that matters most, because it is the one that reproduces. Once a
route queries directly, the next endpoint copies it, and the table ends up with no owner
— the query is written slightly differently in four places and the tenancy filter is
missing from one of them. `modules/pulls/routes.ts` is where this already happened; see
[in-this-repo.md](./in-this-repo.md).

The fix is mechanical: move the queries into a `repository.ts` that owns the table, and
the orchestration between them into a `service.ts`.

## The module as a Fastify plugin (MEDIUM)

Each module exports a plugin function and is registered in `modules/index.ts`. That is
not just a naming convention — `register` creates a new context, and "if you perform any
changes on the Fastify instance, those changes will not be reflected in the context's
ancestors" [6]. A module can add hooks, rate limits, or decorators that apply to its own
routes and nothing else.

Registration order matters and is easy to get wrong: shared plugins (helmet, cors,
rate-limit, SSE, the error handler) register **before** modules, because encapsulation
flows downward — "encapsulation applies to the ancestors and siblings, but not the
children" [6]. A plugin registered after a module does not apply to it.

The plugin system is also the DI mechanism at the transport edge: the container is
attached once with `app.decorate('container', container)` and every module reads
`app.container` [7]. This is why no module imports the container's construction — it
receives it.

## Growing beyond one file per ring (MEDIUM)

When a ring's file gets unwieldy, split *within* the ring rather than inventing a new
one. The public shape stays the same; only the internals move.

- **Service too large** — extract a named collaborator that is still application-ring
  (`run-executor.ts`, `diff-loader.ts`), not a new layer.
- **Repository too large** — split by aggregate into `repository/<aggregate>.repo.ts`
  and compose them behind the single repository class, so callers see no change. See
  [persistence.md](./persistence.md).
- **Helpers too large** — split by concern, never into a `utils.ts`. A file named for a
  concern answers "does my function belong here?"; a file named `utils` answers nothing
  and therefore collects everything.

Adding a *ring* is a different decision, with a much higher bar — see
[logic.md](./logic.md).
