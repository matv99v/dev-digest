# Enforcement and testing

## Why mechanical enforcement, and why now

Every rule in this skill is a statement about imports, which means a tool can check all
of them. Allegro's honest note about running Onion in production is that the
architecture itself provides no protection — "there is no mechanism preventing you from
using a class defined in the application layer in the domain layer, thus breaking the
direction of the dependencies" [5]. Discipline alone loses to a busy week.

`dependency-cruiser@17` is **already a dependency of `server/`** (the repo-intel depgraph
adapter uses it as a library). Enforcing the layering costs a config file and a script —
no new dependency, no new tooling to learn.

## The config

Not installed. This is the file to create when the team decides to turn enforcement on;
it is kept here so the rules and their encoding stay in one place. Rules use regular
expressions, not globs [10].

```js
// server/.dependency-cruiser.cjs
module.exports = {
  forbidden: [
    {
      name: 'no-orm-outside-repository',
      comment:
        'Drizzle and its operators stay inside repositories and the db layer. A route or ' +
        'service composing a where-clause means the table has lost its owner.',
      severity: 'error',
      from: { path: '^src/(modules|platform)/', pathNot: '(repository|\\.repo)\\.ts$' },
      to: { path: '^(node_modules/drizzle-orm|src/db/schema)' },
    },
    {
      name: 'no-fastify-below-routes',
      comment:
        'Only the transport ring knows HTTP exists. A service typed against FastifyRequest ' +
        'cannot be called from a job, a CLI, or a test without inventing a fake request.',
      severity: 'error',
      from: { path: '^src/modules/', pathNot: 'routes\\.ts$' },
      to: { path: '^node_modules/fastify' },
    },
    {
      name: 'no-direct-adapter-import',
      comment:
        'Adapters are resolved from the container, never imported. A direct import defeats ' +
        'ContainerOverrides, so the mock can no longer be substituted in tests.',
      severity: 'error',
      from: { path: '^src/modules/' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'no-vendor-sdk-outside-adapters',
      comment: 'Provider SDKs enter the app only through an adapter implementing a port.',
      severity: 'error',
      from: { pathNot: '^src/adapters/' },
      to: { path: '^node_modules/(octokit|@anthropic-ai/sdk|openai|simple-git)' },
    },
    {
      name: 'core-depends-on-nothing',
      comment:
        'The shared contracts are the innermost ring. They may import zod and each other, ' +
        'and nothing else — that is what makes them safe to share with the client.',
      severity: 'error',
      from: { path: '^src/vendor/shared/' },
      to: { pathNot: '^(src/vendor/shared/|node_modules/zod)' },
    },
    {
      name: 'no-cross-module-internals',
      comment:
        'Modules reach each other through the composition root, not by importing a ' +
        'sibling repository or service directly.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/([^/]+)/(repository|service)',
        pathNot: '^src/modules/$1/',
      },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
```

```json
"scripts": {
  "arch:check": "depcruise src --config .dependency-cruiser.cjs"
}
```

Turned on today it reports the deviations catalogued in
[in-this-repo.md](./in-this-repo.md) — four `routes.ts` files importing `drizzle-orm`,
plus three direct adapter imports. Introduce it with those either fixed or explicitly
excluded, so the first green run is meaningful; a check that has always been red teaches
people to ignore it.

`no-cross-module-internals` uses the group-capture trick from the rules reference —
`([^/]+)` in `from.path` is referenced as `$1` in `to.pathNot`, which is how you express
"any module, but not this one" in a single rule [10].

## Testing follows the rings

The ring a file belongs to determines what its test may touch. This is the payoff for
the layering, and the clearest signal that it is real:

| Ring | Test style | Suffix |
|---|---|---|
| Core (helpers, contracts) | Call the function. No setup | `*.test.ts` |
| Application (services) | Build a container with `ContainerOverrides`; mock adapters | `*.test.ts` |
| Persistence | Real Postgres via testcontainers | `*.it.test.ts` |
| Transport | Build the app, fire requests | `*.it.test.ts` |

The suffix is load-bearing: the suite splits on it, so a DB-backed test named `*.test.ts`
silently breaks the hermetic run for everyone. Any test importing `test/helpers/pg.ts`
must be `*.it.test.ts`.

**If a rule is hard to test hermetically, that is the architecture reporting a leak.**
Needing a live Postgres to check a scoring formula means the formula is inside the
service instead of in a pure helper. Fixing the placement fixes the test — reaching for
an integration test instead buries the signal.

The port/mock symmetry is what makes application tests honest: the same service runs
against `OctokitGitHubClient` in production and `MockGitHubClient` in tests, through one
interface, "developed and tested in isolation from its eventual run-time devices and
databases" [2].

## Reviewing a backend PR for layering

Four questions, in order of how much damage a "no" does:

1. **Does any file import something from further out than itself?** Check `routes.ts`
   for `drizzle-orm`, `service.ts` for `fastify` or a concrete adapter, anything for a
   vendor SDK outside `adapters/`.
2. **Does the new external dependency have a port, a container entry, and a mock?** All
   three, or the boundary is decorative.
3. **Is there a rule that could be a pure function but is not?** If it can only be
   reached through a mocked repository, it is in the wrong ring.
4. **Is there a layer here that does nothing?** A service that forwards one call
   verbatim is a middle man [4] — that is a real finding too, in the other direction.
