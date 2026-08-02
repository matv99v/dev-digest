# Enforcement

Making the review unavoidable rather than remembered.

## What a hook can and cannot do

A `PreToolUse` hook runs a **shell command**, not a skill. It cannot perform the review —
it can only permit or deny the tool call that triggered it.

So the division of labour is:

- **The skill** does the analysis and writes a verdict to `.git/pr-self-review.json`
  (see [gate.md](./gate.md#marker-protocol))
- **The hook** is a gatekeeper: it reads the marker and denies with a message telling the
  user to run `/pr-self-review`

Anything that tries to make the hook itself "run the review" ends up either always denying
or never denying, because a shell script has no way to invoke a skill.

## The hook

Goes in `.claude/settings.json` (checked in — a team gate belongs in version control, not
in `settings.local.json`).

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/pr-self-review-gate.sh"
          }
        ]
      }
    ]
  }
}
```

`.claude/hooks/pr-self-review-gate.sh`:

```bash
#!/usr/bin/env bash
# Denies `git push` / `gh pr create` / `gh pr merge` unless PR Self Review passed
# at exactly this commit with a clean tree. Exit 2 blocks the call.
set -euo pipefail

CMD=$(jq -r '.tool_input.command // ""')

case "$CMD" in
  *"git push"*|*"gh pr create"*|*"gh pr merge"*) ;;
  *) exit 0 ;;
esac

MARKER=".git/pr-self-review.json"
[ -f "$MARKER" ] || {
  echo "PR Self Review has not run on this branch. Run /pr-self-review first." >&2
  exit 2
}

HEAD_SHA=$(git rev-parse HEAD)
MARK_SHA=$(jq -r '.sha // ""' "$MARKER")
VERDICT=$(jq -r '.verdict // ""' "$MARKER")

[ "$MARK_SHA" = "$HEAD_SHA" ] || {
  echo "PR Self Review ran on a different commit ($MARK_SHA). Re-run /pr-self-review." >&2
  exit 2
}
[ -z "$(git status --porcelain)" ] || {
  echo "Working tree changed since PR Self Review ran. Re-run /pr-self-review." >&2
  exit 2
}
[ "$VERDICT" = "PASS" ] || {
  echo "PR Self Review verdict: $VERDICT. Fix the critical findings, then re-run." >&2
  exit 2
}

exit 0
```

Exit `2` blocks the tool call and returns stderr to the agent; exit `0` allows it. Verify
both the hook JSON shape and the stdin payload against the installed Claude Code version
before relying on this — hook schemas change, and a silently misconfigured hook is a gate
that never fires.

**This only covers pushes made through Claude Code.** A push from a terminal or an IDE
bypasses it entirely. If the gate needs to be unconditional, that is a GitHub branch
protection rule with a required status check, not a local hook — a different mechanism with
a different cost, and out of scope here.

## Escape hatch

There must be one, and it should be visible. A gate with no override gets bypassed at the
git layer instead (`--no-verify`, or just pushing from another terminal), which is worse:
the bypass becomes invisible and habitual.

Document `git push --no-verify` as the sanctioned override, and keep the marker file as the
record of what the review said at the time.

## The stale base problem

`git merge-base origin/main HEAD` is only as good as the local `origin/main`. Danger JS
documents the failure mode precisely — the diff "naively uses the local differences in git
from master to the current commit… if you don't keep your master branch sync, then it will
be checking across potentially many branches" ([README.md](./README.md) finding 6).

A stale base fills the report with other people's commits, which reads as a wall of
unexplained findings in files the user never opened. Hence `git fetch origin main` first,
and an explicit warning when the fetch fails.

## v2 — the dependency-cruiser upgrade

The `onion-architecture` error-rule anchor in [gate.md](./gate.md) is currently a model
judgement. It can become an exit code.

`dependency-cruiser@17` is **already a dependency of `server/`** (the repo-intel depgraph
adapter uses it as a library), and
[`onion-architecture/enforcement.md`](../onion-architecture/enforcement.md) already contains
the config. Adding it makes the backend architecture anchor objective and fast:

```bash
pnpm --dir server arch:check     # exit 1 = blocking violations, with file:line
```

The reason it is not v1: turned on today it reports the seven known deviations catalogued in
[`onion-architecture/in-this-repo.md`](../onion-architecture/in-this-repo.md). Those must be
fixed or explicitly excluded first, or the check is red from the first run — and a check
that has always been red teaches people to ignore it.

When it lands, scope it to changed files so it stays consistent with clean-as-you-code.
