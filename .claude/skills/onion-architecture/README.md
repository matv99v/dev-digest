# Onion Architecture Skill

## Motivation

`server/` already *intends* onion layering — `server/README.md` ships a mermaid
"Request & DI flow" diagram showing `route → service → container → adapters`, and
`modules/repos/service.ts` states the rule in its own docblock ("No HTTP and no raw SQL
live here"). But only half the modules follow it. `repos`, `reviews`, `agents` and
`repo-intel` go route → service → repository; `pulls`, `settings`, `polling` and
`workspace` inline `drizzle-orm` and `container.github()` straight into the Fastify
handler. `modules/pulls/routes.ts` is a ~145-line handler doing SQL, GitHub calls, upserts
and an N+1 backfill loop.

Nothing in the repo stated the rule, so nothing stopped the drift — and the imported stack
skills don't help. `fastify-best-practices` teaches a repository factory that takes
`FastifyInstance`, which is the *opposite* of what onion prescribes;
`drizzle-orm-patterns` is pure ORM API surface. Dependency direction, where DI wiring
lives, which layer owns a transaction, and "a route may never call an adapter" were
uncovered by every skill in the catalog.

This skill closes that gap for new backend code and gives review a concrete rule to point
at.

### Merged from a sibling skill

A second, independently written `onion-architecture` skill existed in a parallel checkout of
this project. It was merged in rather than kept as a fork. What came from it: the
`dependency-cruiser` gate (`references/enforcement.md`), the tool → port → adapter table in
`references/layers.md`, the severity-ratchet framing, and the exception ledger. What this
side kept: the pragmatic guardrails, transaction ownership, the testing-seam section, the
"looks like a violation, isn't" list, and per-file line-number citations.

Three of the merged skill's claims were re-measured against this tree and corrected:

- Its baseline was "0 errors, 15 warnings"; here the same config gives **0 errors, 14
  warnings** (the other checkout has one extra module).
- It listed "**8** files query `db/schema` outside a repository". Three of those —
  `repos/helpers.ts`, `reviews/diff-loader.ts`, `reviews/run-executor.ts` — are type-only
  imports of a row type that TypeScript elides. The real backlog is **5**.
- Its `no-circular` backlog is entirely `import type { Container }` edges that vanish at
  compile time, including the one it called a "genuine same-module cycle".

Also documented, and not in the original: the gate cannot see adapter calls made through the
container, so `routes-are-thin` passes on `modules/pulls/routes.ts` despite four
`container.github()` calls in it.

### Design decisions

| Decision | Why |
|---|---|
| **Instruction first, gate second** | The repo has no linter or formatter (`AGENTS.md`). The behavioural rules stand on their own; the `dependency-cruiser` gate in `references/enforcement.md` is documented and validated but not yet landed in `server/` — adopting it is one config file plus a script. |
| **Pragmatic onion, not DDD** | No domain entities with mappers; Drizzle row types are fine inside a service. Over-layering is the failure mode that makes teams abandon the architecture — Rentea's and Three Dots Labs' pieces are the guardrail. |
| **Describes the real tree** | Rings are named in the repo's own paths (`modules/<f>/service.ts`, `platform/container.ts`, `vendor/shared/adapters.ts`), not a generic `domain/ports/adapters` layout the code doesn't have. |
| **`server/` only** | `reviewer-core` is named as the innermost pure ring the server must not pollute, but its own `AGENTS.md` already governs it. |
| **Existing invariants are referenced, not copied** | Multi-tenancy, the `repo-intel` facade and the secrets chokepoint stay owned by `server/AGENTS.md`. |

## Sources

Fetched and read in full while writing: Palermo part 1, Cockburn, Stemmler,
Domain-Driven Hexagon, nodebestpractices "Layer your components", Rentea,
`@fastify/awilix` README. The rest informed specific sections.

### Foundational

- [The Onion Architecture: part 1 — Jeffrey Palermo (2008)](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) — the origin. "All code can depend on layers more central, but code cannot depend on layers further out from the core", and "the database is not the center. It is external." Also [part 2](http://jeffreypalermo.com/blog/the-onion-architecture-part-2/), [part 3](http://jeffreypalermo.com/blog/the-onion-architecture-part-3/), [part 4 — after four years](http://jeffreypalermo.com/blog/onion-architecture-part-4-after-four-years/).
- [Hexagonal Architecture (Ports and Adapters) — Alistair Cockburn (2005)](https://alistair.cockburn.us/hexagonal-architecture/) — a port is "a purposeful conversation", adapters are technology-specific; driving (primary) vs driven (secondary) sides; "code pertaining to the inside part should not leak into the outside part". The source of the naming rule (`GitClient`, not `SimpleGitClient`).
- [Onion Architecture — Herberto Graça, The Software Architecture Chronicles](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85) — how onion, hexagonal and clean architecture relate to each other.
- [Composition Root — Mark Seemann](https://blog.ploeh.dk/2011/07/28/CompositionRoot/) and [Composition Root location](https://blog.ploeh.dk/2019/06/17/composition-root-location/) — only one place knows the object graph, and it sits at the entry point. The justification for `platform/container.ts` being the sole place that says `new` for an adapter.
- [Hexagonal architecture — Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)) — background, including the note that ORM annotations on domain classes couple domain to persistence.
- [The Clean Architecture — Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) — the same dependency rule stated for use cases and entities.
- [Original Palermo example repo](https://github.com/Jordiag/Jeffrey-Palermo-Onion-Architecture) — the 2008 code the articles describe.

### Node / TypeScript

- [Clean Node.js Architecture — Khalil Stemmler](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/) — "Domain Layer code can't depend on Infrastructure Layer code. But Infrastructure Layer code can depend on Domain Layer code." Ports as interfaces owned by the inside, adapters as implementations outside.
- [Domain-Driven Hexagon — Sairyss](https://github.com/Sairyss/domain-driven-hexagon) — the most complete TypeScript reference: application vs domain vs infrastructure, repositories mapping at the boundary, why domain objects shouldn't leak to the API, DI containers, and `dependency-cruiser` for enforcement. Also the source of "one service per use case".
- [Node.js Best Practices — Layer your components](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/projectstructre/createlayers.md) — entry-point / domain / data-access. The entry-point layer stays "quite minimal"; the domain takes a "protocol-agnostic payload, plain JavaScript object" and must not be aware of any edge protocol; data-access is never exposed directly to entry-points. This is the closest published statement of the check "does a `service.ts` import `FastifyRequest`".
- [Node.js Best Practices — Structure by components](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/projectstructre/breakintcomponents.md) — self-contained components consumed only through their public interface. Why `modules/<f>/` is per-feature and why one module doesn't import another's `repository.ts`.
- [Implementing SOLID and the onion architecture in Node.js with TypeScript — Remo Jansen](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad) — the canonical Node write-up. Uses InversifyJS; we use a hand-rolled container instead, but the layer definitions carry over.
- [Functional Core, Imperative Shell — Kenneth Lange (TypeScript)](https://kennethlange.com/functional-core-imperative-shell/), after [Gary Bernhardt's screencast](https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell) — the frame for `reviewer-core` and `helpers.ts`: pure decisions inside, effects at the edge.
- [Hexagonal and Clean Architecture with examples — dyarleniber](https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi)
- [Hexagonal architecture overview & best practices — tsh.io](https://tsh.io/blog/hexagonal-architecture)

### Our stack

- [Fastify — Decorators](https://fastify.dev/docs/latest/Reference/Decorators/), [Plugins](https://fastify.dev/docs/latest/Reference/Plugins/), [Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) and [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) — the mechanism behind `app.decorate('container', container)`, the module-augmentation of `FastifyInstance` in `app.ts`, and why transport plugins are registered before feature modules.
- [@fastify/awilix](https://github.com/fastify/fastify-awilix) — the off-the-shelf DI container we deliberately did **not** adopt (app-scoped `diContainer` + request-scoped `diScope`, PROXY/CLASSIC injection modes). Recorded so the hand-rolled `Container` reads as a choice rather than an oversight; `ContainerOverrides` covers the test seam awilix's scopes would otherwise provide.
- [Repository Pattern with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae) — repository interfaces should express business operations rather than database operations.
- [Drizzle ORM best practices — Paul Serban](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/) — a repository layer isolates query logic, enables DI, and keeps database concerns out of HTTP handlers.
- [Atomic Repositories in Clean Architecture and TypeScript — Sentry](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) — keeping a repository composable inside a larger transaction.
- [Repository Pattern — cosmicpython](https://www.cosmicpython.com/book/chapter_02_repository) — the clearest short treatment of what a repository owes its caller.
- [12-Factor: Store config in the environment](https://12factor.net/config) — config lives in the environment, and secrets need handling beyond plain config. Backs `LocalSecretsProvider` as the single reader and the exclusion of secret keys from `AppConfig`'s zod schema.

### Transactions

- [Unit of Work — ABP documentation](https://abp.io/docs/latest/framework/architecture/domain-driven-design/unit-of-work) — the application service opens the unit of work; repositories participate in the ambient one rather than starting their own.
- [Repositories, transactions, and unit of work — Redowan Delowar](https://rednafi.com/go/repo-txn-uow/) — "Repositories do not start or commit transactions. They execute persistence operations using the handle they were given." The clearest short statement of the rule in the skill.

### Testing the seams

- [Hexagonal Architecture: Do NOT mock everything — Optivem Journal](https://journal.optivem.com/p/hexagonal-architecture-do-not-mock-everything) — mocking everything outside the domain makes tests break on the tiniest change; use in-memory fakes for repositories instead. The argument for `adapters/mocks.ts` over ad-hoc `vi.mock`.
- [The secret world of testing without mocking — Alec Henninger](https://www.alechenninger.com/2020/11/the-secret-world-of-testing-without.html) — "a fake is a complete implementation of some interface suitable for testing", and why that survives refactors.
- [Testing Repository Adapters With Hexagonal Architecture — DZone](https://dzone.com/articles/testing-repository-adapters-with-hexagonal-architecture) — one test suite run against both the in-memory and the real adapter, switching only the runtime.

### Guardrails against over-engineering

- [Overengineering in Onion/Hexagonal Architectures — Victor Rentea](https://victorrentea.ro/blog/overengineering-in-onion-hexagonal-architectures/) — the main source for the "Keep it pragmatic" section. Useless interfaces ("an interface deserves to exist if and only if it has more than one implementation, or it implements Dependency Inversion to protect an inner ring"), relaxed vs strict layers, one-liner controllers, and why separate domain and persistence models quadruple CRUD code.
- [Is Clean Architecture Overengineering? — Three Dots Labs](https://threedots.tech/episode/is-clean-architecture-overengineering/) — apply decoupling to the parts that need it, not uniformly.
- [Where Vertical Slices Fit Inside the Modular Monolith — Milan Jovanović](https://milanjovanovic.tech/blog/where-vertical-slices-fit-inside-the-modular-monolith) — why per-feature `modules/<f>/` folders and onion rings coexist rather than compete: the module boundary is the macro structure, the rings are the micro one.

### Mechanical enforcement

`dependency-cruiser` is *already* a `server` dependency (`adapters/depgraph/` uses it to
build the import graph for repo-intel), so the gate in `references/enforcement.md` costs no
new package.

- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) and [on npm](https://www.npmjs.com/package/dependency-cruiser) — `forbidden` rules over path globs; also detects circular and orphaned modules. What Domain-Driven Hexagon uses.
- [Validate Dependencies According to Clean Architecture — Ken Miyashita](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c) — mapping architecture rings onto `forbidden` rules.
- [Avoid Cross Module Dependencies with Dependency Cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b) — the `$1` back-reference trick behind `no-cross-module-internals`.
- [Dependency Cruiser: Restrict Imports in JavaScript — Atomic Object](https://spin.atomicobject.com/dependency-cruiser-imports/)
- [Maintaining clean architecture with dependency rules — cubic](https://www.cubic.dev/blog/how-to-maintain-clean-architecture-with-dependency-rules-in-your-codebase)

Alternatives considered and not adopted, since dependency-cruiser is already present:

- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) — element types plus an allow/disallow matrix between them.
- [ESLint `no-restricted-imports`](https://eslint.org/docs/latest/rules/no-restricted-imports), [`import/no-restricted-paths`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md), and [Tim Deschryver's write-up](https://timdeschryver.dev/bits/enforce-module-boundaries-with-no-restricted-imports) — the zero-plugin option.

## Files

- `SKILL.md` — the dependency rule, the placement and import tables, the composition root, transactions, pragmatic limits, testing.
- `references/layers.md` — each ring in real paths, the tool → port → adapter table, a worked example, cross-module access, jobs, errors.
- `references/ports-and-adapters.md` — adding an external integration end to end, port design, secrets, resilience, when a port isn't worth it.
- `references/enforcement.md` — the dependency-cruiser config, what the gate can and cannot see, the type-only trap, the severity ratchet, the exception ledger.
- `references/review-checklist.md` — seven checks, anti-patterns with real line numbers, known violations, "looks like a violation, isn't".
