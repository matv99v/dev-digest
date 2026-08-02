---
name: pr-self-review
description: "Reviews all local changes against this repo's own skills before a pull request is opened, and blocks the PR when a critical finding appears. Routes the diff into frontend, backend, test, and full-stack buckets, fans each out to a subagent carrying only that bucket's files and skills, then consolidates into one severity-grouped report with a PASS/BLOCKED verdict. Use when the user says they are about to open a PR, push a branch, or asks to review, check, or sanity-check their changes before sharing them — and whenever a `git push`, `gh pr create`, or `gh pr merge` is imminent. Also use when asked to check work against the team's conventions, architecture rules, or skills."
user-invocable: true
---

# PR Self Review

Runs this repo's skills over the local diff before the changes leave the machine, and
blocks the PR on a critical finding.

The job is **routing**, not reviewing everything with everything. `.claude/skills/` holds
~51k words; loading all of it to review a CSS change wastes context and produces noise.
Read the diff, activate the 2–4 skills that apply, and give each one only the files it
should see.

- Path globs, bucket construction, subagent prompt, finding contract: [routing.md](./routing.md)
- Severity normalization, what blocks, the marker protocol: [gate.md](./gate.md)
- Hook setup and the stale-base problem: [enforcement.md](./enforcement.md)
- The eight sources behind these rules: [README.md](./README.md)

## Workflow

### 1. Compute the diff

```bash
git fetch origin main --quiet          # refresh, or the base is stale
BASE=$(git merge-base origin/main HEAD)
git diff --name-status "$BASE"         # committed
git status --porcelain -uall           # staged, unstaged, untracked
```

`-uall` is not optional: without it `git status` collapses an untracked directory into a
single `dir/` entry, and every file inside a newly added folder silently escapes review.

**Review added and modified lines only — never whole files.** A file you touched carries
other people's history; you own the lines you wrote. This is the rule that keeps the gate
credible: touching one line in a file with five pre-existing violations must not block you
(see [gate.md](./gate.md)).

Report the diff size and stop early when it is empty — no buckets, no subagents.

If `git fetch` fails (offline), say so and continue against the last-known `origin/main`,
flagging that the base may be stale. A silently stale base reviews commits the user never
wrote, which reads as a wall of unexplained findings.

### 2. Apply exclusions, then fill buckets

Exclusions come first, because reviewing config and test infrastructure as if it were
production code is the single largest source of false findings — see
[gate.md](./gate.md#exclusions) for the list and [README.md](./README.md) for the evidence.

| Bucket | Paths | Skills |
|---|---|---|
| **Tests** | `*.test.ts(x)`, `*.it.test.ts`, `e2e/**`, `server/test/**` | `react-testing-library` |
| **Config** | `*.{yml,yaml,json,toml}`, `*.config.*`, `.github/**`, `scripts/**` | correctness + secrets only |
| **UI / frontend** | `client/**/*.{tsx,ts,css}` | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices` |
| **Backend / domain** | `server/src/**/*.ts`, `reviewer-core/src/**/*.ts` | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design` |
| **Full-stack** | path-routed, see [routing.md](./routing.md) | `typescript-expert` · `zod` · `security` |

Match in that order. Tests and Config come first so a `.test.tsx` never meets a
production-rule skill and a `server/*.yaml` never meets `onion-architecture` — bucket globs
match source extensions, never bare directories.

Full-stack is not "everything": `typescript-expert` is the `.ts`/`.tsx` fallback, `zod`
fires on contracts and schema files, `security` on routes, auth, secrets, and input
handling. A file can land in more than one bucket — that is expected and dedupe handles it.

Skills scoped `Shared` in [`../README.md`](../README.md) are never routed — they are
authoring and workflow tools with no rules a diff can violate.

**Announce the routing before reviewing** — which buckets are active, which skills, how many
files, how many excluded. A wrong route is invisible otherwise, and this line is what makes
it obvious.

### 3. Fan out

One subagent per non-empty bucket, all spawned **in parallel in a single message**. Each
gets only its own file list, its own skills, and the finding contract from
[routing.md](./routing.md).

This is what keeps the orchestrator's context clean: each bucket's skills are read inside
its subagent and never enter the main window.

**Instruct subagents toward recall, not caution.** They report everything they can ground;
filtering happens here, in step 4. A subagent that self-censors drops exactly the
cross-cutting findings these skills exist to catch — and it is redundant, because the
orchestrator filters anyway.

### 4. Consolidate — this is the precision layer

1. **Drop ungrounded findings.** Every finding must cite a `file:line` that exists in the
   diff slice its subagent was given. Fabricated references are a known failure mode; an
   unverifiable finding is worth less than no finding.
2. **Re-apply exclusions** as a backstop. Subagents miss their own suppression rules more
   often than they reason badly.
3. **Dedupe** on `file:line` + issue class. Keep the highest severity, and record every
   skill that reported it in `agreedBy` — two buckets independently flagging one line is
   the strongest signal available, and it costs nothing to capture.
4. **Normalize severity** per [gate.md](./gate.md).

### 5. Gate and report

`critical_count ≥ 1` → `⛔ BLOCKED`. Otherwise `✅ PASS`.

Write the marker file described in [gate.md](./gate.md#marker-protocol) so the hook can
tell a reviewed commit from an unreviewed one.

## Report format

Group by severity, sort by file within each group, and label every row with its source
skill and a [Conventional Comments](https://conventionalcomments.org/) label. **Print the
table even on PASS** — a run with four HIGH findings and no blocker is the normal case, and
a bare `✅ PASS` would hide them.

```
PR Self Review — 14 files · FE (9) · BE (5) · 3 excluded (tests, config)
Skills: frontend-ui-architecture, react-best-practices, onion-architecture, security

CRITICAL (1)
  server/src/modules/pulls/routes.ts:223   issue (blocking)   [onion-architecture]
  Transport composing SQL — pr_files has no owning repository
  → move the insert into modules/pulls/repository.ts

HIGH (2)
  client/src/app/pulls/_components/PRRow.tsx:41   issue   [react-best-practices]
  useQuery called inline in a component — belongs in lib/hooks/
  → move to lib/hooks/reviews.ts

  server/src/modules/settings/service.ts:12   issue   [onion-architecture]
  Module imports an adapter directly, bypassing the container
  → resolve through container.<port>

MEDIUM (5)
  … one line each

⛔ BLOCKED — 1 critical
```

## Constraints

- **Review only — never edit.** The diff being reviewed is about to become a PR; changing it
  mid-review invalidates the result and produces a report that no longer matches the code.
  Findings carry a `fix` field describing the change; applying it is a separate, explicit
  request. (Skill frontmatter cannot enforce this — `allowed-tools` pre-approves tools, it
  does not restrict them — so it holds by intent.)
- **Never block on style.** Formatting, naming, and missing tests are MEDIUM at most. The
  blocking budget is spent on correctness, security, and leaks that spread.
- **State what was skipped.** Excluded file counts belong in the header, so "it found nothing"
  can be told apart from "it looked at nothing".
