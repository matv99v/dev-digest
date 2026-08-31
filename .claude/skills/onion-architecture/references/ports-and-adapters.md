# Adding an external integration

Read this when the code you're about to write talks to something outside the process: a
network service, a vendor SDK, a CLI binary, the filesystem, a clock, randomness.

The rule is that such code never appears in a `routes.ts` or a `service.ts`. It goes behind
a **port** (an interface the inner code owns) implemented by an **adapter** (the outer code
that knows the vendor), and the container decides which adapter is in play.

## Contents

- [The five steps](#the-five-steps)
- [Designing the port](#designing-the-port)
- [Where the port interface lives](#where-the-port-interface-lives)
- [Secrets](#secrets)
- [Failure and resilience](#failure-and-resilience)
- [When a port is not worth it](#when-a-port-is-not-worth-it)

## The five steps

Follow `GitClient` end to end as the model: `vendor/shared/adapters.ts` →
`adapters/git/simple-git.ts` → `container.git` → `ContainerOverrides.git` →
`MockGitClient` in `adapters/mocks.ts`.

### 1. Define the port

```ts
// src/vendor/shared/adapters.ts  (excerpt)
export interface GitClient {
  clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }>;
  sync(repo: RepoRef, branch: string): Promise<{ head: string }>;
  diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff>;
  // …
}
```

Types the port exchanges (`RepoRef`, `UnifiedDiff`, `CloneOptions`) go in the same file.
They are part of the contract, not the adapter.

### 2. Implement it

```ts
// src/adapters/<name>/<vendor>.ts
export class SimpleGitClient implements GitClient { … }
```

One directory per port, named for the port. The class name may mention the vendor — that's
the one place it should. Configuration and credentials arrive through the constructor; the
adapter never reads `process.env` or `AppConfig` itself.

### 3. Wire it in the container

Synchronous when it needs no secret:

```ts
get git(): GitClient {
  if (this.overrides.git) return this.overrides.git;
  this._git ??= new SimpleGitClient(this.config.cloneDir);
  return this._git;
}
```

Async when it does — the pattern `github()` and `llm(id)` use:

```ts
async github(): Promise<GitHubClient> {
  if (this.overrides.github) return this.overrides.github;
  if (this._github) return this._github;
  const token = await this.secrets.get('GITHUB_TOKEN');
  if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
  this._github = new OctokitGitHubClient(token);
  return this._github;
}
```

Order matters and is always the same: **override → cache → construct.** The override wins
unconditionally so a test never accidentally hits the network. If the adapter caches a
secret, add it to `invalidateSecretCaches()` so saving a new key in Settings takes effect
without a restart.

### 4. Add the override key

```ts
export interface ContainerOverrides {
  …
  myThing?: MyPort;
}
```

Skipping this is the most common way a new integration becomes untestable. If you find
yourself writing `vi.mock('../../adapters/…')` in a test, step 4 was missed.

### 5. Add a fake

`src/adapters/mocks.ts` holds `MockLLMProvider`, `MockEmbedder`, `MockGitHubClient`,
`MockGitClient`, `MockCodeIndex`, `MockAuthProvider`, `MockSecretsProvider`. Add yours
next to them.

A fake is a working implementation with an in-memory store, not a stub that records calls.
The difference shows up on refactors: a fake keeps passing when the calling code changes
shape, a call-shape mock doesn't. It also lets one test suite run against both the fake
and the real adapter when that's worth doing.

## Designing the port

- **Name it for the conversation, not the vendor.** `CodeIndex`, not `RipgrepSearcher` —
  the ripgrep adapter already falls back to a pure-Node walk when the binary is absent, and
  the port didn't have to change for that.
- **Express what the application needs**, not what the SDK offers. `GitClient.diff` returns
  a `UnifiedDiff`, not an Octokit response object. A port that returns vendor types has
  moved the coupling rather than removed it.
- **Keep it small.** Add methods when a use case needs them. A port mirroring an entire SDK
  is an SDK with extra steps.
- **No Fastify, no Drizzle types** in a port signature. Those are outer rings; a port that
  mentions them can't point inward.

## Where the port interface lives

`vendor/shared/adapters.ts` when the client also speaks the type, or when more than one
module uses the port. Next to the adapter (`adapters/depgraph/index.ts`,
`adapters/tokenizer/index.ts`) when it is internal to the server and used by one pipeline.

`vendor/shared` is the canonical contracts copy — add files, never edit it in place
(`server/AGENTS.md`).

## Secrets

`LocalSecretsProvider` is the single chokepoint that reads `process.env` for a key, and
`AppConfig` deliberately excludes secrets from its zod schema. An adapter receives its
credential as a constructor argument from the container; it does not fetch it.

That's the same port rule applied to configuration: the code that needs a token depends on
"something that supplies a token", not on the environment.

## Failure and resilience

Timeouts and retries belong at the edge, in or around the adapter —
`platform/resilience.ts` (`withTimeout`, `withRetry`) is applied that way in
`adapters/github/octokit.ts`.

Whether a failure is fatal is a *decision*, so it belongs in the service. Review context
enrichment is best-effort by design: the service catches, omits that prompt section and
continues. The adapter just throws.

## When a port is not worth it

An interface earns its existence if it has a second implementation, or it inverts a
dependency to protect inner code. A mock in `adapters/mocks.ts` counts as the second
implementation — so anything doing real I/O almost always qualifies.

What doesn't qualify: an internal helper class used by one service; a wrapper whose methods
forward one-to-one to a library that is already pure and synchronous; a port introduced
"in case we swap it later" for something nothing else could plausibly replace. Those add
indirection without buying substitutability.
