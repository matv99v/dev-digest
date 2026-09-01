# Enforcement — the dependency-cruiser gate

Read this when you want the dependency rule checked mechanically rather than by review, or
when a `depcruise` run reported something and you need to know whether it's real.

`dependency-cruiser` is **already** in `server/package.json` — `adapters/depgraph/` uses it
to build the import graph for repo-intel — so there is nothing new to install.

## Contents

- [What the gate can and cannot see](#what-the-gate-can-and-cannot-see)
- [The config](#the-config)
- [Scripts and baseline](#scripts-and-baseline)
- [Reading the backlog: the type-only trap](#reading-the-backlog-the-type-only-trap)
- [Severity as a ratchet](#severity-as-a-ratchet)
- [Encoded exceptions](#encoded-exceptions)

## What the gate can and cannot see

`dependency-cruiser` is a test runner for your **import graph**. It declares `forbidden`
rules over `from → to` path patterns. RE2-based, so no regex look-ahead: exclusions are
`pathNot`, and `$1` in `to.path` back-references the capture group in `from.path`.

**It sees import edges. It does not see calls made through the container.** This matters
here more than in most codebases, because the whole point of the composition root is that
feature code reaches adapters *without importing them*.

Verified on this tree: the `routes-are-thin` rule passes clean — yet
`modules/pulls/routes.ts` calls `container.github()` at lines 36, 190, 288 and 311. The
route imports `platform/container.js`, not `adapters/github/octokit.js`, so no forbidden
edge exists. The worst layering violation in the repo is invisible to the rule written to
catch it.

So the gate and the human checks cover different halves:

| Caught by the gate | Caught only by `review-checklist.md` |
|---|---|
| `reviewer-core` importing anything with I/O | a route calling `container.github()` / `container.llm()` / `container.db` |
| a service importing a concrete adapter class | a handler that owns a whole use case |
| a route importing `src/adapters/**` or `db/schema` | a repository that opens its own transaction |
| an adapter importing a feature module | an unscoped query missing `workspaceId` |
| cross-module imports bypassing the container | an N+1 loop at the edge |

A green `depcruise` run is necessary, not sufficient. Don't report a backend change as
architecturally clean on the gate alone.

## The config

Create `server/.dependency-cruiser.cjs`. CommonJS on purpose: `server` is
`"type": "module"`, so a plain `.js` config would be parsed as ESM.

```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-is-pure',
      comment:
        'reviewer-core is the domain core: no I/O, only the injected LLMProvider. ' +
        'The same code runs in the server and in CI.',
      severity: 'error',
      from: { path: 'reviewer-core/src' },
      to: {
        path: [
          '^fastify', 'drizzle-orm', '^postgres', 'octokit', 'simple-git',
          '@ast-grep/napi', '/src/adapters/', '/src/db/', '^node:fs',
        ],
      },
    },
    {
      name: 'services-depend-on-ports',
      comment:
        'A feature service orchestrates through ports (via container.*), never a concrete ' +
        'adapter. Exception: repo-intel IS the indexer subsystem, i.e. infrastructure.',
      severity: 'error',
      from: {
        path: 'src/modules/[^/]+/(service|run-executor)[^/]*\\.ts$',
        pathNot: 'src/modules/repo-intel/',
      },
      to: { path: 'src/adapters/' },
    },
    {
      name: 'routes-are-thin',
      comment:
        'Transport calls the service; it never imports an adapter. NOTE: this cannot see ' +
        'container.github() called from a handler — see "What the gate cannot see".',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/routes\\.ts$' },
      to: { path: 'src/adapters/' },
    },
    {
      name: 'adapters-dont-know-modules',
      comment:
        'Infrastructure must not depend on a feature. Exception: adapters/depgraph reads ' +
        'repo-intel/constants — move that constant out to retire the exception.',
      severity: 'error',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/', pathNot: '^src/modules/repo-intel/constants' },
    },
    {
      name: 'db-confined-to-repositories',
      comment:
        'Drizzle queries belong in modules/*/repository*. WARN: real backlog is 5 files; ' +
        '3 more are type-only imports of a row type (see the type-only trap below).',
      severity: 'warn',
      from: { path: 'src/modules/', pathNot: 'src/modules/[^/]+/repository' },
      to: { path: ['src/db/schema', '^drizzle-orm'] },
    },
    {
      name: 'no-cross-module-internals',
      comment:
        'One feature reaches another only through container.*, never by importing a sibling ' +
        'module folder. _shared is the allowed common ground.',
      severity: 'warn',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/([^/]+)/', pathNot: ['^src/modules/$1/', '^src/modules/_shared/'] },
    },
    {
      name: 'no-circular',
      comment:
        'WARN: every cycle here runs through the DI root via `import type { Container }` and ' +
        'disappears at compile time — plus one genuine cycle, agents/helpers <-> agents/repository.',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['node_modules', '/dist/', '\\.test\\.ts$', '\\.it\\.test\\.ts$'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
```

## Scripts and baseline

```jsonc
{
  "scripts": {
    "depcruise": "depcruise src --config .dependency-cruiser.cjs",
    "depcruise:all": "depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs"
  }
}
```

`server/package.json` has been claimed to be `skip-worktree`; check with
`git ls-files -v server/package.json` before assuming an edit there will stick. Running
`npx depcruise src --config .dependency-cruiser.cjs` directly always works.

Measured on this tree: **0 errors, 14 warnings, 125 modules, 374 dependencies.**
dependency-cruiser exits non-zero only on an `error`, so the gate is green today and blocks
any *new* error. Wire it in next to typecheck and tests.

## Reading the backlog: the type-only trap

The 14 warnings are not 14 problems. With `tsPreCompilationDeps: false` the same config
reports **0 errors, 6 warnings** — the difference is entirely imports that TypeScript
elides at compile time and that therefore create no runtime coupling:

| Warning | With `true` | With `false` | Verdict |
|---|---|---|---|
| `db-confined-to-repositories` | 8 files | 5 files | `repos/helpers.ts`, `reviews/diff-loader.ts`, `reviews/run-executor.ts` import `db/schema` only for a row type. `repos/helpers.ts` uses it once, at `toRepoDto(row: typeof t.repos.$inferSelect)`. Allowed — see the pragmatic section of SKILL.md |
| `no-circular` | 5 cycles | 0 | all of them run `container ↔ service` through `import type { Container }`. A type-level artifact of the "service takes Container" style, not a runtime cycle. The one genuine cycle, `agents/helpers ↔ agents/repository`, also vanishes — it is type-only too |
| `no-cross-module-internals` | 1 | 1 | `repos/service.ts → repo-intel/constants.ts` — real, relocate the constant |

The obvious precise fix does **not** work: adding `dependencyTypesNot: ['type-only']` to
those rules changes nothing (tested — still 14). `repos/helpers.ts` writes
`import * as t from '../../db/schema.js'`, which is syntactically a value import that merely
happens to be used in type position, so dependency-cruiser cannot classify it as type-only.

So: keep `tsPreCompilationDeps: true` as the default — it is what catches a service
importing `FastifyRequest`, which is real protocol leakage even when type-only — and triage
a backlog with a one-off `false` run before believing a count:

```bash
cd server
npx depcruise src --config .dependency-cruiser.cjs --output-type err-long   # readable report
sed 's/tsPreCompilationDeps: true/tsPreCompilationDeps: false/' .dependency-cruiser.cjs > /tmp/dc.cjs \
  && npx depcruise src --config /tmp/dc.cjs --output-type err                # runtime-only edges
```

**The real backlog is 5 files + 1 cross-module edge**, not 14 findings.

## Severity as a ratchet

Adopt this incrementally, not big-bang. Rules the codebase already satisfies are `error`;
rules with genuine existing violations start at `warn` as a burn-down baseline, then get
promoted once the backlog is cleared.

- **`error` — clean today, keep blocking:** `core-is-pure`, `services-depend-on-ports`,
  `routes-are-thin`, `adapters-dont-know-modules`.
- **`warn` — burn down, then promote:**
  - `db-confined-to-repositories` — 5 runtime files: the `routes.ts` of `polling`, `pulls`,
    `workspace`, `settings`, plus `settings/feature-models.ts`. Promote once each moves into
    a repository. The three type-only edges never need "fixing".
  - `no-cross-module-internals` — `repos/service.ts → repo-intel/constants.ts`. Relocate the
    constant to `platform/` or `_shared`, then promote.
  - `no-circular` — decide a policy first. The cycles are a consequence of services taking
    the whole `Container`; either narrow services to the ports they use, or exclude the
    composition root from circular detection. Don't promote before deciding.

When you clear a backlog or remove an exception in code, tighten the config in the same
change. An exception that outlives its cause silently reopens the boundary — that tightening
*is* the ratchet.

## Encoded exceptions

| Exception | Why | How to retire it |
|---|---|---|
| `repo-intel/service` may import adapters (`pathNot` on `services-depend-on-ports`) | repo-intel is the indexer subsystem, reached through the `container.repoIntel` facade — it *is* infrastructure | none needed; keep the facade boundary intact |
| `adapters/depgraph` → `repo-intel/constants` (`pathNot` on `adapters-dont-know-modules`) | shares a supported-extensions constant | move the constant to `platform/` or `_shared`, then delete the `pathNot` |
