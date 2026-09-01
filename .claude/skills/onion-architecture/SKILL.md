---
name: onion-architecture
description: Layering rules for the DevDigest backend (server/) - route to service to repository, with external effects (git, GitHub, LLM, secrets, code index) behind ports resolved from the container. Use when adding or reviewing anything under server/src - a route, service, repository, Drizzle query, background job, or new third-party integration - or when deciding where backend code belongs. Covers onion/hexagonal layering, ports and adapters, dependency injection, composition root.
---

# Onion architecture — `server/`

`server/` is an onion: HTTP and third-party SDKs sit on the outside, business logic sits
inside, and **dependencies only ever point inward**. Half the modules already follow this
(`repos`, `reviews`, `agents`, `repo-intel`); the other half predate the rule and are
listed in `references/review-checklist.md` as things to copy *away from*, not toward.

This skill is about *where code goes and what may import what*. Fastify mechanics, Drizzle
query syntax and zod parsing are covered by the `fastify-best-practices`,
`drizzle-orm-patterns` and `zod` skills — see "Already covered elsewhere" at the bottom.

## The rule

```
                    outside ─────────────────────────────► inside
  src/adapters/**            modules/<f>/routes.ts     modules/<f>/service.ts
  simple-git, octokit,       Fastify handler,          use case, tenancy,
  anthropic, openai,         zod schema, HTTP codes    transactions, orchestration
  ripgrep, secrets, db/                    │                      │
        ▲                                  │                      ▼
        │ implements                       │           modules/<f>/repository.ts
        │                                  │           the only SQL for its tables
  vendor/shared/adapters.ts ◄──────────────┴──────────────────────┤
  ports: GitClient, GitHubClient, LLMProvider,                    ▼
  Embedder, CodeIndex, SecretsProvider, AuthProvider    helpers.ts / constants.ts
                                                        contracts/ / reviewer-core
        platform/container.ts + app.ts                   pure functions, zod types,
        composition root — wires outside to inside       zero I/O
```

Two consequences that catch almost everything:

1. **A route never reaches past its service.** No `drizzle-orm` import, no `db/schema.js`
   import, no `container.db`, no `container.git` / `container.github()` / `container.llm()`
   in a handler. If a handler needs data, it calls a method on its service.
2. **Inner code never imports outer code.** `helpers.ts` doesn't import Fastify; a service
   doesn't import `FastifyRequest`; `reviewer-core` imports nothing with I/O at all.

The direction is what makes the code testable and the tenancy guard reviewable in one
place. It is not about counting layers — skipping a layer that adds nothing is fine
(see "Keep it pragmatic"), reversing an arrow is not.

## Where does this code go?

| What you're writing | Where it goes |
|---|---|
| URL, HTTP verb, status code, zod request/response schema, rate limit | `modules/<f>/routes.ts` |
| "First do X, then Y, and enqueue Z" — the use case | `modules/<f>/service.ts` |
| A Drizzle query | `modules/<f>/repository.ts` |
| A pure transform, parse, or derivation (no `await` on I/O) | `modules/<f>/helpers.ts` |
| A literal: job kind, clone depth, secret key name | `modules/<f>/constants.ts` |
| Anything that talks to the network, the filesystem, or a vendor SDK | a **port** + `src/adapters/<name>/` |
| The wiring that decides which implementation is used | `platform/container.ts` |
| A type both client and server speak | `src/vendor/shared/contracts/` |

Copy the shape of `modules/repos/` — it is the reference implementation, and its docblocks
already state the rule (`service.ts`: "No HTTP and no raw SQL live here";
`repository.ts`: "The ONLY place that touches the `repos` table").

## What each layer may import

| Layer | May import | May not |
|---|---|---|
| `routes.ts` | its own `./service.js`, `_shared/context.js`, `_shared/schemas.js`, contracts from `@devdigest/shared`, `platform/errors.js`, `fastify`, `zod` | `drizzle-orm`, `db/schema.js`, `db/client.js`, anything under `src/adapters/` |
| `service.ts` | `platform/container.js` (type), its `./repository.js`, `./helpers.js`, `./constants.js`, other modules' repos via `container.*Repo`, port **types** from `@devdigest/shared` | `fastify` (no `FastifyRequest`/`FastifyReply`), concrete adapter classes from `src/adapters/` |
| `repository.ts` | `drizzle-orm`, `db/schema.js`, `db/client.js` (`Db` type) | `platform/container.js`, `fastify`, any adapter |
| `helpers.ts`, `constants.ts` | contracts, `zod`, other pure helpers | everything with I/O |
| `src/adapters/**` | its vendor SDK, the port interface it implements, `platform/errors.js` | `platform/container.js`, any `modules/` code |
| `platform/container.ts` | everything — that's its job | — |

`service.ts` receives the whole `Container`; `repository.ts` receives only `Db`. That
asymmetry is deliberate: a repository that can't see the container can't grow a network
call by accident.

Routes get their tenancy from `getContext(container, req)` — that call *is* the auth port
in use, so it's allowed and in fact required (`server/AGENTS.md` invariant: every domain
table carries `workspaceId`).

## The container is the only place that says `new` for an adapter

`platform/container.ts` is the composition root — the single spot that knows which concrete
class implements which port. Feature code asks for a capability and gets an interface back;
it never imports `OctokitGitHubClient` or `SimpleGitClient` by name.

Adding an external integration is five mechanical steps: **port** in
`src/vendor/shared/adapters.ts` → **adapter** in `src/adapters/<name>/` → lazy getter on
`Container` → key in `ContainerOverrides` → fake in `src/adapters/mocks.ts`. Name the port
for the conversation, not the vendor: `GitClient`, not `SimpleGitClient`.

Load `references/ports-and-adapters.md` before doing it — it has the code for each step and
the rules for designing the port.

A port used by exactly one module and never crossing to the client may live next to its
adapter instead of in the shared file — `DepGraph` (`adapters/depgraph/index.ts`) and
`Tokenizer` (`adapters/tokenizer/index.ts`) do this. Ports the client also speaks belong in
`vendor/shared/`.

**Secrets have exactly one reader.** `LocalSecretsProvider` is the only code that touches
`process.env` for a key; `AppConfig` deliberately omits them. Never read
`process.env.OPENAI_API_KEY` from a service.

## Transactions belong to the service

The service opens and commits; the repository executes on the handle it is given and never
starts or commits a transaction of its own. A repository method that begins its own
transaction can't be composed into a larger use case.

Practically: pass the transactional handle down as the `Db` a repository was constructed
with, or give the repository method an optional executor parameter. Don't scatter
`db.transaction(...)` across `repository.ts` files.

## Keep it pragmatic

This is a *pragmatic* onion, not a DDD showcase. These limits are as much a part of the
rule as the dependency direction — over-layering is the failure mode that makes teams
abandon the architecture entirely.

- **Drizzle row types are fine inside a service.** No separate domain entity plus a mapper
  for CRUD. The boundary that matters is the zod contract at the HTTP edge, and
  `fastify-type-provider-zod` already enforces it on the response.
- **An interface earns its existence** only if it has a second implementation (a mock in
  `adapters/mocks.ts` counts), or it inverts a dependency to protect inner code. Don't
  wrap an internal class in an interface just to have one.
- **Relaxed layers.** A route may call a service which calls another service; a service may
  read a plain lookup without a repository method per column. Skipping a hop that would add
  nothing is fine as long as the arrow still points inward.
- **Don't create a `service.ts` to forward one query.** A read-only endpoint whose entire
  body is one scoped select can go route → repository. When a second caller or any branch
  appears, add the service.
- **Don't build layers for tables nothing uses yet.** `db/schema/` declares tables on
  purpose that sit empty; leave them alone (`AGENTS.md`).

## Testing follows the same seam

`buildApp({ config, db, overrides })` in `src/app.ts` is the injection point, and
`ContainerOverrides` is the list of things a test can replace. Tests exercise behaviour
through `app.inject()` with fakes injected at the container, rather than constructing
services by hand.

Prefer a fake in `src/adapters/mocks.ts` over an ad-hoc `vi.mock` — a fake is a real
implementation of the port, so it survives refactors that a call-shape mock does not. If a
new integration can't be swapped through `overrides`, that's the layering telling you it
was wired in the wrong place.

DB-backed tests must be named `*.it.test.ts` or they break the unit/integration split.

## Checking it mechanically

Part of this rule is machine-checkable. `dependency-cruiser` is already a `server`
dependency, and a config exists in `references/enforcement.md` that runs green today
(0 errors, 14 warnings — of which the real backlog is 5 files and 1 edge).

It catches import edges: `reviewer-core` reaching for I/O, a service importing a concrete
adapter, a route importing `db/schema`, an adapter importing a feature. It **cannot** see a
call made through the container — `container.github()` inside a handler leaves no forbidden
import, so the `routes-are-thin` rule passes on `modules/pulls/routes.ts` despite four such
calls. A green run is necessary, not sufficient; the checks in
`references/review-checklist.md` cover the other half.

## Load only what the task needs

Everything above is enough to place most code. The files below are loaded on demand — each
costs 1.5K–2.5K tokens, so pull the one that matches the task rather than all of them.

| Load | When |
|---|---|
| `references/layers.md` | placing a file, or adding an endpoint end to end. Has a worked example and the per-ring detail |
| `references/ports-and-adapters.md` | the change talks to the network, the filesystem, or a vendor SDK |
| `references/review-checklist.md` | reviewing a diff, or deciding whether something already in the tree is a violation |
| `references/enforcement.md` | setting up or interpreting the dependency-cruiser gate, or triaging what a run reported |
| `README.md` | you need the source or rationale behind one of these rules |

If none applies, don't load any — the tables above are the rule.

## Already covered elsewhere — don't restate

- Fastify plugin encapsulation, registration order, hooks, error handling →
  `fastify-best-practices`
- Drizzle schema, query, relation and transaction syntax → `drizzle-orm-patterns`
- zod parsing, `safeParse`, inference, validate-once-at-the-boundary → `zod`
- Multi-tenancy, `repo-intel` facade, secrets path, injection guard →
  `server/AGENTS.md` (source of truth; this skill only points at them)

One deliberate conflict: `fastify-best-practices/rules/database.md` teaches a repository
factory that takes `FastifyInstance`. Here a repository takes `Db` and nothing else — a
repository holding the Fastify instance can reach every adapter, which is the coupling this
skill exists to prevent.
