# PR Self-Review Skill

## Motivation

This repo carries 13 skills, several written specifically for it — `ui-architecture` and
`onion-architecture` both contain a real review checklist, and `onion-architecture` even ships
a "how to phrase a finding" section. Until now nothing applied any of them to a diff. They
fire opportunistically while code is being written, so by the time a PR is opened nobody has
checked the branch against the rules the repo wrote down for itself.

This skill is the missing consumer. It runs before a PR exists, routes each changed file to
the skills that actually govern it, and turns the result into a gate that stops the push.

## Design decisions

| Decision | Why |
|---|---|
| **Deterministic gates before any LLM pass** | Typecheck and unit tests cost no tokens and catch what a review can only guess at. Reviewing architecture on a tree that does not compile produces findings that are symptoms of the type error |
| **The project's own severity enum, not a new one** | `server/src/vendor/shared/contracts/findings.ts` already defines `CRITICAL / WARNING / SUGGESTION`, and `docs/agent-prompts/README.md` warns that a parallel scale gets mapped onto the enum inconsistently and inflates severities. A local review and a DevDigest review now read the same |
| **A closed CRITICAL catalogue** | "A broken invariant" is a dial each subagent sets differently. An enumerated list makes the gate predictable, and predictability is what makes a gate trusted rather than bypassed |
| **Adversarial verification before blocking** | One wrong block teaches the team the gate is noise, and a bypassed gate reviews nothing. Being slightly too permissive keeps it alive |
| **Added/modified lines only** | `onion-architecture` documents four files as known violations. Reporting those on an unrelated one-line change is the fastest way to make this skill hated |
| **One subagent per matched skill** | Isolated context per skill, run in parallel. Small diffs (≤ ~3 files, one bucket) skip the fan-out, where the overhead exceeds the benefit |
| **The hook fails open** | A bug in `check-gate.sh` must never block every command in the repo. It denies only on a fact it established — never on an unknown |
| **One `diff-hash.sh` for both sides** | The review stamps the hash and the hook re-checks it. Two implementations of "has the diff moved?" would drift, and the freshness check would be theatre |
| **A required reason on the override** | `PR_SELF_REVIEW_OVERRIDE="reason"` keeps the escape hatch a decision rather than a reflex. A gate with no way out gets deleted |

## Adapted from the reference implementation

A working version of this skill exists in a parallel checkout of this project
(`../orig-dev-digest`, branch `lesson-2-lab/skills`). It was adapted rather than copied.

**Taken from it:** the deterministic-gates-first ordering, adversarial verification, the
closed CRITICAL catalogue, the `// pr-self-review-ignore:` suppression, the contract-drift
check, the fail-open hook, the single shared `diff-hash.sh`, intercepting all three of the
push / PR-open / PR-merge commands, feeding each subagent the touched package's `INSIGHTS.md`,
and the small-diff inline path.

**Changed, with reasons:**

- Its `CRITICAL / HIGH / MEDIUM` scale was dropped for the product's own
  `CRITICAL / WARNING / SUGGESTION`, per the decision table above. Its mapping table survives,
  retargeted onto the real enum.
- Its skill map routes to `vercel-react-best-practices` and `nodejs-best-practices`, which
  exist in neither checkout, and to `react-architecture-analyzer` / `code-reviewer` subagents,
  when neither checkout has a `.claude/agents/` at all. Its `frontend-architecture` is this
  checkout's `ui-architecture`. Routing to a skill that is not installed makes a run silently
  review less than it claims, so every row here was checked against `.claude/skills/`.
- Its gate table says "typecheck — always (every package defines it)" and calls the package's
  own `test` script. Here the package manager differs per package, and `server/package.json`
  is `skip-worktree`, so its scripts are not what runs — CI invokes vitest directly. `gate.md`
  now lists the per-package command CI actually uses.

**Three things it does not account for, all found by testing this tree:**

1. **Substring matching on the command fires on any command that merely mentions the trigger
   words.** The reference matches `*"git push"*` against the raw command, so writing
   documentation about the gate, grepping for it, or echoing a reminder all trip it. This one
   bit immediately — the first attempt to write this very README was blocked by the hook,
   because the file content contains the words. `check-gate.sh` now strips heredoc bodies and
   comments, then requires the verb at the start of a command segment.
2. **Four contract pairs already differ** — `eval-ci.ts`, `knowledge.ts`, `productionize.ts`
   and `trace.ts` (the server copy carries an `openrouter` provider and an `AgentManifest` the
   client copy lacks). A whole-tree drift comparison would therefore open with four CRITICALs
   on every PR. The check is scoped to contracts the diff touches.
3. **The state file must be git-ignored, or no PASS can ever match.** `.pr-self-review.json`
   is untracked, so while it was visible to `git ls-files --others` it fed its own diff hash:
   writing the receipt changed the hash the receipt had just recorded, and every run came back
   stale. Fixed in `.gitignore`, with the reason written next to the entry.

## Testing

`scripts/check-gate.sh` was exercised across its whole decision matrix:

- **Command matching** — 14 cases. Allowed: a plain command, a heredoc whose body contains the
  trigger words, a grep for the literal, an echo mentioning it, a shell comment, another git
  subcommand, `gh pr list`. Denied: bare and argumented pushes, `git -C dir push`, a push after
  `&&`, an env-prefixed push, `gh pr create`, `gh pr merge`.
- **State handling** — missing state, `BLOCKED` verdict, stale hash, matching PASS, and corrupt
  JSON. The corrupt-JSON case is the one worth keeping: it asserts the hook fails open.

`evals/evals.json` holds six prompts, with `tenancy.patch`, `cosmetic.patch` and
`type-error.patch` as fixtures — all three generated from real edits to real files, so they
apply cleanly, and `type-error.patch` genuinely fails `tsc` (TS2322). Four of the six cases
test the gate *not* over-firing, which is the failure mode that kills a review gate. Not yet
run as a benchmark.

## Sources

| Source | Taken |
|---|---|
| `../orig-dev-digest/.claude/skills/pr-self-review/` | The mechanics listed above |
| `docs/agent-prompts/README.md` | Severity vocabulary, the anti-inflation rule, the score formula, "no findings ⇒ approve" |
| `server/src/vendor/shared/contracts/findings.ts` | `Severity`, `Verdict`, the finding shape |
| `.claude/skills/onion-architecture/references/review-checklist.md` | The seven backend checks and the "looks like a violation, isn't" list used during verification |
| `.claude/skills/ui-architecture/SKILL.md` | The "Symptom → fix" table used by the UI bucket |
| `AGENTS.md`, `.github/workflows/*.yml` | The repo rules in `routing.md` §5 and the exact per-package gate commands |
