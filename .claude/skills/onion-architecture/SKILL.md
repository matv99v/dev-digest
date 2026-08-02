---
name: onion-architecture
description: "Backend architecture decisions for the server package — which ring owns a responsibility, which imports are legal in each direction, where ports and adapters go, what a repository may return, where business rules live, and when a layer is not worth adding. Use whenever backend work touches structure: adding a module or route, introducing an external dependency (SDK, API, CLI), writing or growing a service or repository, wiring the DI container, or reviewing a PR under server/ for layering. Reach for it even when the request sounds routine (\"add an endpoint\", \"call this API\", \"save this to the DB\", \"where should this go\") — layering is decided silently inside almost every backend change, and a leak is expensive to reverse once callers depend on it."
---

# Onion Architecture

Answers the backend version of the question that comes up on every feature:
**which ring does this belong to, and what is it allowed to import?**

This skill covers architectural *judgement* for `server/`. For framework mechanics —
route declaration, hooks, serialization, error handlers — see
[fastify-best-practices](../fastify-best-practices/SKILL.md). For query syntax, schema
definition, and migrations, see
[drizzle-orm-patterns](../drizzle-orm-patterns/SKILL.md). For contract design, see
[zod](../zod/SKILL.md).

## Severity levels

Every rule heading in the topic files carries a tier. It says what a violation costs, so a
reviewer can tell a leak from a preference:

- **CRITICAL** — breaks an invariant the codebase holds everywhere, or spreads on contact:
  the dependency rule, a route composing SQL, a vendor SDK reaching past `adapters/`, the
  query language escaping a repository, a missing tenancy scope. These block a PR
  (`pr-self-review`).
- **HIGH** — a real defect or drift that is expensive to reverse once callers depend on it.
- **MEDIUM** — consistency and reviewability; worth fixing, never worth blocking on.

## The one rule everything else serves

**All coupling points inward.** A ring may import from rings more central than itself
and never from rings further out. The outer world — Fastify, Drizzle, Octokit, provider
SDKs — reaches the core only through interfaces the core itself declares [1][2].

```
   routes.ts          transport      Fastify, Zod schemas, HTTP status codes
      ↓
   service.ts         application    orchestration; ports (types only); no HTTP, no SQL
      ↓
   repository.ts      persistence    Drizzle, db/schema — and nothing above it
      ↓
   contracts, errors, helpers        pure; imports nothing from the rings above
```

Adapters sit *outside* everything and are pulled in at the composition root, so the
arrow from a service to an adapter is a type, never a `new`.

The rule earns its keep in exactly one way worth caring about: it decides how much of
the system a change can break. Palermo's original argument was that data access changes
often, and coupling business logic to it means the business "has no choice but to let
the system fall behind into a state of disrepair" [1].

## The rings and the module file set

What each layer may contain and import.

See [rings.md](./rings.md) for:
- The four rings, with the import table that defines each one
- The module file set (`routes` / `service` / `repository` / `helpers` / `constants`) and when each file appears
- Why a Fastify plugin is the module boundary, and what encapsulation buys
- Splitting a module that outgrew one file per ring
- The failure to recognise on sight: a route that queries the database

## Ports, adapters, and the composition root

How external systems enter the application.

See [ports-adapters.md](./ports-adapters.md) for:
- The four-step sequence for any new external dependency — port, adapter, wiring, mock
- Where a port lives and why it is declared inside the core, not beside the adapter
- The composition root: lazy construction, `ContainerOverrides`, and the one legal `new`
- Depending on ports vs depending on the container, and the trade this repo made
- When an "adapter" is really just a helper

## Persistence and the ORM boundary

What a repository owes its callers.

See [persistence.md](./persistence.md) for:
- What must not escape a repository (query builders, operators) and what may (row types)
- Tenancy scoping as a repository invariant, not a caller's responsibility
- Transactions across repositories, and where the transaction is opened
- Translating database failures into the `AppError` taxonomy
- Growing a repository: splitting by aggregate behind one class

## Business rules, services, and when not to add a layer

Where logic goes once it leaves the route handler.

See [logic.md](./logic.md) for:
- The three kinds of backend logic and the ring each belongs to
- The anemic-service trap, and the pure-helper answer to it [3]
- The interface test — when an abstraction deserves to exist [4]
- Layers you may skip, and the module that correctly has only a `routes.ts`
- Jobs, background work, and which ring owns the handler

## Enforcement and testing

Making the rules fail loudly instead of relying on memory.

See [enforcement.md](./enforcement.md) for:
- A ready `.dependency-cruiser.cjs` encoding the rules above [10]
- Why the tool is already installed here and what enabling it would catch today
- Testing per ring: hermetic inward, integration only at the edges
- Reviewing a backend PR for layering in four questions

## In this repo

DevDigest's actual state, with verified paths — including where it does not comply.

See [in-this-repo.md](./in-this-repo.md) for:
- The reference module to copy, and why it is the reference
- The five known deviations, each with `file:line`, marked as debt rather than precedent
- `db/rows.ts` — a sanctioned exception a naive reading of this skill would break
- Which conventions are settled and which are still open

## Examples

See [examples.md](./examples.md) for good/bad pairs covering every rule above.

## Sources

See [README.md](./README.md) for the ten sources behind these rules — each fetched and
quoted — plus the points where they disagree and the position this skill takes.
