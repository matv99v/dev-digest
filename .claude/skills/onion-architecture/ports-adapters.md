# Ports, adapters, and the composition root

## Any new external dependency: four steps, in this order (CRITICAL)

An "external dependency" is anything the application does not control — an HTTP API, an
SDK, the filesystem, a spawned binary, the clock. The order matters because writing the
port first forces you to describe what the application *needs* before you know what the
vendor *offers*, which is what keeps the vendor's shape out of the core.

**1. Declare the port in the core.** An interface in
`server/src/vendor/shared/adapters.ts`, named for the capability
(`GitHubClient`, `Embedder`, `Tokenizer`), not for the vendor (`OctokitWrapper`).
Palermo's formulation: "Only the interface is in the application core" [1].

> `@devdigest/shared` is **two copied directories**, not a package. Edit both, or the
> contract silently drifts — nothing checks them. This is the single most common way to
> break this step.

**2. Implement it in `server/src/adapters/<concern>/<impl>.ts`.** The file named for the
vendor (`octokit.ts`, `simple-git.ts`, `ripgrep.ts`) so a second implementation can sit
beside the first without renaming anything. This is the only place the vendor's package
may be imported.

**3. Wire it in `platform/container.ts`** as a lazy getter, with an entry in
`ContainerOverrides` so tests can inject a substitute.

**4. Add a mock to `adapters/mocks.ts`**, implementing the same interface. This is not
bookkeeping — it is the payoff. Cockburn's stated intent for the whole pattern is to
"allow an application to equally be driven by users, programs, automated test or batch
scripts, and to be developed and tested in isolation from its eventual run-time devices
and databases" [2]. A port with no mock has bought you nothing yet.

Skipping straight to step 2 and importing the vendor from a service is the mistake this
sequence exists to prevent. It is cheap in the moment and expensive later: the vendor's
error types, pagination shape, and auth model spread outward through every caller.

## Why the port lives inside, not beside its adapter (HIGH)

The instinct is to put the interface next to the implementation, in `adapters/`. That
inverts the dependency: the core would import from `adapters/` to name the type, and the
arrow points outward again.

The interface belongs where it is *consumed* and *defined by need* — the core. The
adapter folder imports it, implements it, and depends inward. That is dependency
inversion doing its actual job, rather than an interface used decoratively.

The practical test: could you delete the entire `adapters/` folder and still typecheck
the services? If yes, the ports are in the right place.

## The composition root (HIGH)

`platform/container.ts` is the only place in the application that constructs an adapter.
One `new` per adapter, all of them here, nowhere else.

What the container does and why each part is deliberate:

- **Lazy getters.** Adapters are built on first access, not at boot. This is what lets
  the API start with no API keys configured — a provider that is never used is never
  constructed, so its missing key never throws.
- **`ContainerOverrides`.** Tests build a container with mocks injected, then build the
  real app around it. The production wiring is exercised; only the edges are swapped.
- **Secret resolution.** Adapters needing credentials get them through
  `SecretsProvider`, resolved at construction. Nothing below the container reads
  `process.env` or a secrets file.
- **Shared repositories.** Repositories used by more than one module are constructed
  here too, so a module reaches `container.agentsRepo` instead of importing another
  module's `repository.ts`. Cross-module data access goes through the composition root,
  not through a sibling's folder.

Everything else *receives* the container or the specific ports it needs. A service that
imports a concrete adapter has bypassed all of this — the mock can no longer be
substituted, and the test that was supposed to be hermetic now makes a network call.

## Depending on ports vs depending on the container (MEDIUM)

Two defensible styles:

```ts
// A — inject the ports the service actually uses
class RepoService {
  constructor(private git: GitClient, private repo: RepoRepository) {}
}

// B — inject the container
class RepoService {
  constructor(private container: Container) {}
}
```

**A** is the stricter form. The constructor signature documents the dependency set, and
a test supplies two objects instead of a container.

**B** is what this repo uses, consistently. The trade is real and worth naming: it keeps
wiring short in a codebase where services need five or six collaborators, at the cost of
a signature that no longer tells you what the service touches. It stays acceptable
because the container hands out **port interfaces**, so the service is still coupled to
abstractions — it just discovers them at the call site instead of the constructor.

**Follow B for consistency; the rule that actually matters is unchanged either way** —
the type a service depends on is the interface, never the implementing class. Where
style A costs nothing (a service with one or two collaborators), it is a fine local
improvement and needs no justification.

## When an "adapter" is really a helper (MEDIUM)

Not every boundary needs a port. The test [4]:

> "An interface deserves to exist **if and only if**: 1) it has more than one
> implementation in the project, or 2) it is used to implement Dependency Inversion to
> protect an Inner Ring, or 3) it is packaged in a client library"

A pure function over data — parsing a unified diff, extracting endpoints from a source
file, formatting a prompt — has no external dependency to invert. It is a helper. It may
live in `adapters/` for topical reasons, but it should be imported as the pure function
it is, and it does not need an interface, a container entry, or a mock.

Applying the test in reverse is just as useful: an interface with one implementation,
consumed only within the same module, and never mocked, is ceremony. Delete it and
depend on the class.
