---
name: pr-self-review
description: "Local pre-PR gate for DevDigest. Run before opening or updating a pull request — before `git push`, `gh pr create`, or `gh pr merge` — or on demand via /pr-self-review. Computes the diff against origin/main, runs cheap deterministic gates (typecheck and unit tests), then routes the changed files through the project's own architecture and quality skills per bucket (UI vs backend), adversarially verifies every CRITICAL, and BLOCKS the push while a verified CRITICAL remains. Use whenever the user is about to push, open or merge a PR, asks to self-review or sanity-check local changes before a PR, or when the pre-PR hook reports a missing or stale review."
user-invocable: true
version: "1.0.0"
allowed-tools: Read, Grep, Glob, Bash, Agent, Write
---

# PR Self-Review — local pre-PR gate

Catch problems **before** a pull request exists. This skill is an orchestrator: it holds no
review knowledge of its own. It scopes the diff, runs the cheap automated checks, delegates
each changed file to the skills that already govern it, and turns their findings into a
merge gate.

- **What blocks:** one or more *verified* CRITICAL findings from the closed catalogue in
  [gate.md](gate.md). Nothing else, however a skill labels it.
- **What never blocks:** WARNING and SUGGESTION, pre-existing code on untouched lines,
  test-file style, generated and vendored code.

Companion files: **[routing.md](routing.md)** (diff scope, skip list, file→skill map,
contract drift) and **[gate.md](gate.md)** (deterministic gates, severity mapping, the
CRITICAL catalogue, verification, suppression, state file, escape hatch).

## When this runs

1. **Automatically** — a `PreToolUse` hook (`scripts/check-gate.sh`, wired in
   `.claude/settings.json`) intercepts `git push`, `gh pr create` and `gh pr merge`, and
   denies the command unless a fresh PASS is on record. The hook never runs the review; it
   only enforces that one ran and passed *for the current diff*.
2. **Manually** — `/pr-self-review`, or when the user asks to self-review or look over the
   branch before a PR. This is the path that actually performs the review and writes the
   state file the hook reads.

## Procedure

Run in order, cheapest first, and stop early on a hard failure. Reviewing architecture on a
tree that does not compile spends tokens describing symptoms of a type error.

### 1. Scope the diff

Per [routing.md](routing.md) §1:

- `BASE="$(git merge-base origin/main HEAD)"`.
- All open changes vs main: `git diff "$BASE"` covers committed-not-merged, staged and
  unstaged in one pass; `git ls-files --others --exclude-standard` adds untracked files,
  which count in full because a newly created misplaced file is exactly what
  `ui-architecture` exists to catch.
- Reduce to **added/modified lines only** and apply the skip list.
- No reviewable changes → write a `PASS` state and stop.

### 2. Deterministic gates

Per [gate.md](gate.md) §1, for each package that has changed files. These cost no tokens and
catch what an LLM pass would only guess at, so they come first. The first non-zero exit means
**BLOCKED** — record which gate failed and skip the LLM passes entirely.

Use the exact commands in that table. They are the ones CI runs, which is not always the
package's own `test` script — `server/package.json` is `skip-worktree`, so its scripts are
not what actually runs.

### 3. Route and review

Per [routing.md](routing.md) §2–§3, split the changed files into buckets and spawn **one
subagent per matched skill, all in one message so they run in parallel**. Give each subagent:

- only its slice of the diff,
- only its own skill to load,
- the touched package's `INSIGHTS.md` as extra review criteria — the repo's recorded
  gotchas are review criteria for free,
- the severity rubric from [gate.md](gate.md) §2.

Require structured findings — `{file, line, severity, skill, issue, fix}` — and **no verdict
and no score**. Those are computed once, centrally, in step 4, so that two subagents cannot
disagree about whether the branch is blocked.

For a small diff (≤ ~3 files in a single bucket) review inline instead; the fan-out overhead
is not worth it.

### 4. Normalize, verify, gate

Per [gate.md](gate.md) §2–§5:

- Map each skill's own scale onto `CRITICAL / WARNING / SUGGESTION`.
- Drop findings suppressed by a `// pr-self-review-ignore:` comment on the same line.
- Drop findings whose lines fall outside the diff — a finding on an untouched line is about
  code the author did not write.
- **Adversarially verify every CRITICAL** before it is allowed to block. One refuted block
  teaches the team to bypass the gate, and a bypassed gate reviews nothing.
- `verifiedCritical ≥ 1` → **BLOCKED**, else **PASS**.

### 5. Record and report

- Write `.pr-self-review.json` (repo root, git-ignored) with the verdict, the `diffHash` from
  `scripts/diff-hash.sh`, base, head sha, counts and findings. The hash **must** come from
  that script, because the hook recomputes it with the same script — a later edit then
  invalidates the PASS on its own.
- Print a summary grouped by severity, ending in `✅ PASS` or `⛔ BLOCKED — N critical`.
- On BLOCKED, list each critical as `file:line` plus its fix, and name the escape hatch
  (`PR_SELF_REVIEW_OVERRIDE="reason"`) rather than leaving the author to search for it.

## Output contract

`.pr-self-review.json` at the repo root is the single source of truth — the hook reads it.
The chat summary is for the human. Write the state file on **every** completed run, including
a blocked one: the hook reads the verdict, so a blocking record has to exist to be read.
