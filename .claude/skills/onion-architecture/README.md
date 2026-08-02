# References

Sources behind every rule in this skill. Each was fetched and read on **2026-08-02**,
not cited from a search summary — the claims below are what the page actually says.

Rules in the topic files cite these by number, e.g. `[4]`. A rule with no number is a
judgement call this skill is making on its own, and says so.

---

## Foundational architecture

### [1] Jeffrey Palermo — The Onion Architecture, part 1
<https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/>

The 2008 original. Backs the dependency rule in [SKILL.md](./SKILL.md) and the port
placement in [ports-adapters.md](./ports-adapters.md).

> "all code can depend on layers more central, but code cannot depend on layers further
> out from the core. In other words, all coupling is toward the center."

On where interfaces live — the reason ports are declared in the core rather than beside
their adapters:

> "The first layer around the Domain Model is typically where we would find interfaces
> that provide object saving and retrieving behavior, called repository interfaces. The
> object saving behavior is not in the application core, however, because it typically
> involves a database. **Only the interface is in the application core.**"

The motivation is economic, not aesthetic:

> "The biggest offender (and most common) is the coupling of UI and business logic to
> data access."

> "If coupling prevents easily upgrading parts of the system, then the business has no
> choice but to let the system fall behind into a state of disrepair."

### [2] Alistair Cockburn — Hexagonal Architecture (Ports and Adapters)
<https://alistair.cockburn.us/hexagonal-architecture/>

Backs the port/mock symmetry in [ports-adapters.md](./ports-adapters.md) and the testing
table in [enforcement.md](./enforcement.md). The stated intent:

> "Allow an application to equally be driven by users, programs, automated test or batch
> scripts, and to be developed and tested in isolation from its eventual run-time
> devices and databases."

> "code pertaining to the inside part should not leak into the outside part."

Test harnesses and production drivers are treated symmetrically — a mock database and a
real one are two adapters on the same port, which is exactly what `ContainerOverrides`
implements.

### [3] Martin Fowler — AnemicDomainModel
<https://martinfowler.com/bliki/AnemicDomainModel.html>

Backs the anemic-service section in [logic.md](./logic.md).

> "The catch comes when you look at the behavior, and you realize that there is hardly
> any behavior on these objects, making them little more than bags of getters and
> setters."

> "There are a set of service objects which capture all the domain logic, carrying out
> all the computation and updating the model objects with the results."

The cost, which is the part that applies here:

> "The problem with anemic domain models is that they incur all of the costs of a domain
> model, without yielding any of the benefits."

> "If all your logic is in services, you've robbed yourself blind."

---

## The counterweights

### [4] Victor Rentea — Overengineering in Onion/Hexagonal Architectures
<https://victorrentea.ro/blog/overengineering-in-onion-hexagonal-architectures/>

The most useful source here, because it is the one that says *stop*. Backs the interface
test in [ports-adapters.md](./ports-adapters.md) and "when not to add a layer" in
[logic.md](./logic.md).

> "An interface deserves to exist **if and only if**: 1) it has more than one
> implementation in the project, or 2) it is used to implement Dependency Inversion to
> protect an Inner Ring, or 3) it is packaged in a client library"

> "Question any interface with a single implementation, in the same module."

On the middle-man smell — a layer that only forwards:

> "indirection without abstraction – it does not add any new semantic (abstraction) to
> the method to which it delegates"

> "Testing such silly methods with mocks would lead to 5x times larger test code than
> tested code. Worse, it would feel useless – what are the chances that a bug would
> occur inside such a method?"

It also advises merging controllers with application services for REST APIs, and
propagating REST DTOs inward rather than maintaining parallel DTO sets — see the
disagreements section below for the position this skill takes on that.

### [5] Allegro Tech — Onion Architecture
<https://blog.allegro.tech/2023/02/onion-architecture.html>

A production retrospective rather than a tutorial. Backs the "outer may skip a ring"
clarification in [rings.md](./rings.md) and the enforcement argument in
[enforcement.md](./enforcement.md).

> "the dependency direction always goes from the outside to the inside, never the other
> way around."

> "every outer layer sees classes from all inner layers, not only the one directly
> below."

The honest part, and the reason this skill ships a `dependency-cruiser` config:

> "there is no mechanism preventing you from using a class defined in the application
> layer in the domain layer, thus breaking the direction of the dependencies."

Downsides it reports first-hand: "Additional learning curve for new developers",
"Increased overall complexity of the codebase", and:

> "Onion Architecture is not a one-size-fits-all solution... is best suited for services
> with a clear domain definition."

---

## The tools this repo actually uses

### [6] Fastify — Plugins Guide
<https://fastify.dev/docs/latest/Guides/Plugins-Guide/>

Backs the module-as-plugin section in [rings.md](./rings.md).

> "register creates a new Fastify context, which means that if you perform any changes
> on the Fastify instance, those changes will not be reflected in the context's
> ancestors."

> "Do note that encapsulation applies to the ancestors and siblings, but not the
> children."

This is why shared plugins (helmet, cors, rate-limit, SSE, the error handler) must be
registered **before** feature modules: encapsulation flows downward only. The guide also
frames the plugin tree as the unit of eventual decomposition — everything is a plugin,
so a module can be extracted without refactoring.

### [7] Snyk — Fastify plugins as building blocks for a backend Node.js API
<https://snyk.io/blog/fastify-plugins-for-backend-node-js-api/>

Backs the `app.decorate('container', …)` pattern in [rings.md](./rings.md).

> "Fastify has a rich plugin architecture that supports encapsulation. This means you
> can easily break down your application into isolated components, each with its own set
> of routes, plugins, and decorators."

> "Fastify's plugin system also acts as a lightweight dependency injection (DI) system.
> This allows for easy sharing of common utilities and services across your application
> without resorting to singletons or global variables."

The last clause is the point: decoration is what lets the composition root be handed
down instead of imported, which is what keeps modules free of construction logic.

### [8] Sentry — Atomic Repositories in Clean Architecture and TypeScript
<https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/>

Backs the transaction and error-translation rules in [persistence.md](./persistence.md).

> "we'll be using that type in the application layer, so no database-related imports are
> allowed"

> "Atomicity in the Repository Pattern occurs when multiple repositories execute their
> queries in one transaction"

> "In a Clean Architecture application, you need to create the transaction at the
> controller level and pass it down to every use case"

On the ORM's own failure mode:

> "In the context of Clean Architecture, we'd have to map that to our own custom error
> from the Entities layer"

This skill places the transaction in the **service**, not the controller — see the
disagreements below.

### [9] Drizzle ORM — Transactions
<https://orm.drizzle.team/docs/transactions>

Backs the transaction mechanics in [persistence.md](./persistence.md).

`db.transaction(async (tx) => …)` passes a `tx` object with the same API as the database
instance; statements inside use `tx` rather than `db`. Rollback happens two ways: an
exception thrown anywhere in the callback rolls the whole transaction back, or
`tx.rollback()` triggers it explicitly.

The detail worth knowing before writing a `try/catch` inside a transaction: **`rollback()`
works by throwing**. A catch block that swallows errors also swallows the rollback
signal. Nested transactions are supported via savepoints.

### [10] dependency-cruiser — Rules reference
<https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md>

Backs the config in [enforcement.md](./enforcement.md).

A `forbidden` rule is `{ name, severity, comment, from, to }`, where `from` and `to`
match modules by `path` / `pathNot`. Paths are matched with **regular expressions, not
globs**, and always use forward slashes.

The technique behind `no-cross-module-internals` is group capture — a parenthesised group
in `from.path` is referenced as `$1` in the `to` section:

```json
{
  "name": "no-inter-ubc",
  "comment": "Don't allow relations between business components",
  "severity": "error",
  "from": { "path": "^src/business-components/([^/]+)/.+" },
  "to": {
    "path": "^src/business-components/([^/]+)/.+",
    "pathNot": "^src/business-components/$1/.+"
  }
}
```

Violations exit non-zero, so the check fails CI rather than producing a report nobody
reads.

---

## Where the sources disagree

The disagreements are where this skill has to take a position rather than report one.

### How many rings, and are DTOs worth the mapping?

[1] and [5] describe a full ring set with mapping between layers. [4] argues much of that
is over-engineering for a typical REST service: merge controllers with application
services, propagate REST DTOs inward instead of maintaining parallel Application and
REST DTO sets, and let ORM annotations sit on domain entities rather than duplicating a
persistence model.

**Position taken:** [4]'s pragmatism, which this codebase already embodies. There is no
separate DTO set — the Zod contracts in `vendor/shared/contracts/` *are* the transport
shape, the validation schema, and the type the service passes around, and they are
shared with the client on top of that. One definition, no mapping layer. Rows are mapped
to contracts at the repository/service edge, and that single mapping is the only one
this skill asks for.

The line this skill does **not** cross with [4] is merging the controller into the
service. Fastify's route handler carries request parsing and status-code mapping; a
service that takes a `FastifyRequest` cannot be called from the job runner, which this
system does constantly.

### Where is the transaction opened?

[8] says the controller creates the transaction and passes it into every use case,
keeping the application layer free of the decision.

**Position taken:** the **service** opens it. In a Fastify codebase the controller is a
route handler, and pushing transaction management there would put persistence lifecycle
into the transport ring — trading one leak for another, and making the same unit of work
impossible to reuse from a job. The service is the innermost ring that knows the full
sequence, which makes it the right owner. Repository methods accept an optional executor
so they work either way.

### Rich entities, or pure functions?

[3] prescribes putting behaviour on domain objects. [1] describes a domain model of
"state and behavior combination".

**Position taken:** pure functions beside the contracts. The contracts here are Zod
schemas that must stay serialisable and are shared with the frontend, so methods on
them are not an option. Fowler's warning still applies in full — it just resolves to
"extract a named pure function into `helpers.ts`" rather than "add a method to the
entity". The failure being avoided is identical: logic reachable only through a service,
testable only through a mock.

### Does the domain get its own folder?

Most Onion writing implies a dedicated innermost directory (`domain/`, `core/`).

**Position taken:** no `server/src/domain/`. The domain contracts live in
`vendor/shared/contracts/` because they are shared with the client, and domain rules
live in each module's `helpers.ts`. The dependency rule is satisfied — the contracts
import nothing but `zod` and each other, and [enforcement.md](./enforcement.md) has a
rule that keeps it that way. Introducing a parallel `domain/` tree would leave every
existing module drifting from a layout nothing yet uses. See
[in-this-repo.md](./in-this-repo.md).

---

## Considered and excluded

- **`marcoturi/fastify-boilerplate`** and **`sujeet-agrahari/node-fastify-architecture`**
  — Fastify + clean architecture reference layouts. Useful as prior art, but both encode
  layout choices (CQRS, vertical slices) this repo has not made, so nothing here rests
  on them.
- **NDepend, Bitloops, DZone, and various Medium explainers on Onion Architecture** —
  read during research and consistent with [1] and [5], but they restate the original
  without adding evidence. Cited nowhere rather than padding the list.
