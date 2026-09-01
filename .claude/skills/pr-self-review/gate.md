# Gate — checks, severity, verification, state

The logic that turns findings into a PASS/BLOCKED verdict. Read with [SKILL.md](SKILL.md)
(procedure) and [routing.md](routing.md) (scope and skill map).

## 1. Deterministic gates

No tokens, highest signal. Run **per package that has changed files**, in this order; the
first non-zero exit means BLOCKED, and the LLM passes are skipped.

| Order | Gate | Package | Command (from that package's directory) |
|---|---|---|---|
| 1 | Typecheck | `client` | `pnpm typecheck` |
| 1 | Typecheck | `server` | `pnpm typecheck` |
| 1 | Typecheck | `reviewer-core` | `npm run typecheck` |
| 2 | Lint | any | `pnpm lint` / `npm run lint` — **only if that package defines it** |
| 3 | Arch graph | `server` | `pnpm depcruise` — **only if** `server/.dependency-cruiser.cjs` exists |
| 4 | Unit tests | `client` | `pnpm test` |
| 4 | Unit tests | `server` | `pnpm exec vitest run --exclude '**/*.it.test.ts'` |
| 4 | Unit tests | `reviewer-core` | `npm test` |

Grounded in this repo, and worth re-checking before relying on it:

- **Do not run `pnpm test` in `server/`.** `server/package.json` is `skip-worktree`
  (`AGENTS.md`), so the committed file is not what runs locally and its scripts drift. CI
  calls `pnpm exec vitest run` directly for exactly this reason, and so does this gate.
- **The package manager differs per package** — pnpm for `server` and `client`, npm for
  `reviewer-core` and `e2e`. Mixing them breaks `--frozen-lockfile` in CI.
- **`server` tests need `reviewer-core/node_modules` to exist.** The server imports
  `reviewer-core`'s raw `.ts` through a tsconfig alias, so without it the run dies at boot
  with `ERR_MODULE_NOT_FOUND` — a missing install, not a real failure. Check before reporting.
- **Server *integration* tests (`.it.test.ts`) need Postgres** and are deliberately out of
  scope for a pre-PR gate; they stay in CI. Run them locally only if Docker is already up.
- **e2e is not a gate.** It needs the whole stack on alternate ports (`./scripts/e2e.sh`),
  which is far past what belongs in front of a `git push`.
- No package defines `lint`, and `server/.dependency-cruiser.cjs` does not exist, so gates 2
  and 3 no-op today. They are written conditionally so they start working the day either
  lands — `onion-architecture` ships the dependency-cruiser config ready to adopt.

## 2. Severity — normalize every skill onto the project's own scale

The scale is not ours to invent. `server/src/vendor/shared/contracts/findings.ts` defines it
for the whole product, and `docs/agent-prompts/README.md` warns specifically against
introducing a parallel one ("the model will map it onto the enum inconsistently and inflate
severities"). A local review and a DevDigest review must read the same.

| Level | Means | Effect |
|---|---|---|
| **CRITICAL** | A bug, broken contract, or architecture violation from §3 | **Blocks**, after verification |
| **WARNING** | Performance, scaling or maintainability risk | Reported |
| **SUGGESTION** | Style, DX, naming | Reported |

Mapping the source skills, which use their own vocabularies:

| Source scale | Maps to |
|---|---|
| `react-best-practices` CRITICAL / HIGH / MEDIUM | CRITICAL / WARNING / SUGGESTION |
| `security` HIGH confidence / MEDIUM / LOW | CRITICAL / WARNING / **dropped** — that skill says not to report LOW |
| `onion-architecture` or dependency-cruiser `error` / `warn` | CRITICAL / WARNING |

Speculation is capped at WARNING. "Might be", "if this isn't already handled elsewhere" and
"consider" are not blockers — they are the exact phrasing that inflates a gate into noise.

## 3. The closed CRITICAL catalogue

The gate is predictable on purpose: a finding blocks **only** if it matches this list.
Anything else is at most WARNING, no matter how confidently a skill labels it. An open-ended
definition like "a broken invariant" is a dial each subagent sets differently, and a gate
whose threshold moves per run is one nobody trusts.

**Backend**
- An onion dependency-rule violation: I/O inside `reviewer-core`, a service importing a
  concrete adapter from `src/adapters/`, a route reaching past its service into an adapter.
- A query not scoped by `workspaceId` — it leaks across workspaces and still compiles, which
  is why repositories exist at all.
- `@devdigest/shared` contract drift on a **touched** contract ([routing.md](routing.md) §4).
- Unvalidated external input crossing a trust boundary: a route body or query used without a
  Zod parse, an injection sink, a missing or fail-open auth check.

**UI**
- A derive-don't-store violation — state stored that should be computed.
- An impure component, or a side effect during render.
- A hook-rules violation: a conditional or looped hook call, or a dependency array producing
  a stale closure or an infinite loop.

**Both**
- A type error or failing test from §1 — already blocking, deterministically.
- A secret or credential committed in the diff.
- Any repo-rule violation from [routing.md](routing.md) §5.

## 4. Adversarial verification

Before any CRITICAL is allowed to block, run one skeptic pass over it:

> Try to refute this finding. Is the input really attacker-controlled? Is this really on a
> line the diff touches? Does this really violate the rule, or does it match a documented
> exception? **Default to refuted when uncertain.**

A CRITICAL that survives blocks. One that is refuted is **downgraded to WARNING and reported
as downgraded** — never dropped silently, because a disappearing finding is unreviewable.

This step is not optional. One wrong block teaches the team that the gate is noise, and a
gate that gets bypassed by habit reviews nothing at all. Being slightly too permissive keeps
the gate alive; being too aggressive kills it.

`onion-architecture/references/review-checklist.md` has a "Looks like a violation, isn't"
section — the SSE generator in a route, `getContext(container, req)` everywhere, a read-only
route going straight to a repository, a service using Drizzle row types. Check a candidate
CRITICAL against that list before letting it block.

## 5. Suppression

A finding is dropped when the **same line** carries:

```ts
// pr-self-review-ignore: <reason>
```

The reason is required, and the report echoes the count ("3 findings suppressed") so
suppressions stay visible and auditable rather than silently accumulating. Without an in-code
way to acknowledge a finding, the only route past a wrong one is disabling the gate.

## 6. Score and verdict

From `docs/agent-prompts/README.md`, so the number matches what the product would show:
start at 100, then `CRITICAL −35`, `WARNING −12`, `SUGGESTION −3`, floored at 0.

| Outcome | Verdict | Gate |
|---|---|---|
| ≥ 1 verified CRITICAL | `request_changes` | **BLOCKED** |
| Findings, none critical | `comment` | PASS |
| No findings | `approve` | PASS |

## 7. State file and escape hatch

### `.pr-self-review.json` — repo root, git-ignored, per-developer

Written at the end of **every** run, including a blocked one; read by the `PreToolUse` hook.

```jsonc
{
  "verdict": "PASS",                  // or "BLOCKED"
  "diffHash": "<scripts/diff-hash.sh output>",
  "base": "origin/main",
  "headSha": "<git rev-parse HEAD>",
  "criticalCount": 0,
  "warningCount": 2,
  "suggestionCount": 4,
  "suppressedCount": 1,
  "downgradedCount": 1,
  "skills": ["ui-architecture", "security"],
  "ranAt": "<ISO-8601>",
  "findings": [
    { "file": "", "line": 0, "severity": "", "skill": "", "issue": "", "fix": "" }
  ]
}
```

The hook recomputes the hash with the **same script** and compares. A missing file, a
`BLOCKED` verdict, or a hash mismatch all deny the command. Both sides must go through
`scripts/diff-hash.sh` — two implementations of "has the diff moved?" would drift, and the
freshness check would become theatre.

### Escape hatch

Every blocking gate needs a documented way out, or it gets deleted outright.

- `PR_SELF_REVIEW_OVERRIDE="reason"` — the hook allows the command and logs the reason to
  stderr. The reason is required precisely so that overriding stays a decision rather than a
  reflex.
- `git push --no-verify` bypasses git's own hooks, but **not** this one — it is a Claude Code
  `PreToolUse` hook, so use the environment variable for that path.

Use it for genuine hotfixes, and put the reason in the PR description.
