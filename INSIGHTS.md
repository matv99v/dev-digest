# Insights — root (config & CI)

Lessons about root configuration, CI workflows, `scripts/`, lockfiles, and tooling —
things that are not any module's code.

**A lesson about module code never lands here.** It is split across the modules it
concerns, each file stating the part that matters there, even when that means two files.

Append with `/engineering-insights`. **Never rewrite or delete an entry** — correct an
outdated one by adding a newer dated entry that supersedes it.

When an entry has bitten twice, promote its **Rule** into `AGENTS.md` and leave the cause
here. Architectural decisions with reasoning belong in `docs/`, not here. Prune
quarterly; past ~30 entries, split by domain.

<!-- Entry format — newest first inside its section:
### YYYY-MM-DD — one-line statement of the finding
**Cause:** what was actually wrong (omit when nothing failed).
**Rule:** what to do or avoid next time. Required.
**Evidence:** `path/to/file.ts:42`. Required.
-->

## What Works

## What Doesn't Work

### 2026-08-31 — A ranking step nothing consumes is decorative, and it is where a dropped limit hides
**Cause:** `engineering-insights` ranked candidate findings four deep, then never said how
many to write. The ranking ordered nothing, because every candidate survived it. An earlier
rewrite had dropped the "≤5 candidates" cap that used to consume that order, and the
ranking's presence concealed the loss — the file still read as though it controlled volume.
**Rule:** every ordering or scoring step in a skill needs a later step that reads it ("write
at most two, from the top of that list"), otherwise it is prose. When reviewing a rewritten
skill, trace each step's output to the step that consumes it; a step nothing consumes is the
usual hiding place for a constraint that was removed.
**Evidence:** `.claude/skills/engineering-insights/SKILL.md:54-57`.

### 2026-08-31 — An untracked state file that feeds a diff hash invalidates itself the moment it is written
**Cause:** `diff-hash.sh` folds untracked file *contents* into the hash, so that a brand-new
file invalidates a stale review. `.pr-self-review.json` was itself untracked, so it landed in
its own hash: writing the receipt changed the value the receipt had just recorded, and the gate
reported "your changes moved since the last review" on a review one second old. It reads as a
hashing bug; it is a scoping one.
**Rule:** any per-developer state file consumed by `diff-hash.sh` must be in `.gitignore`
**before** the first run — otherwise no PASS can ever match and the gate blocks unconditionally.
The `.gitignore` entry carries this reason inline so it is not "tidied away" later.
**Evidence:** `.claude/skills/pr-self-review/scripts/diff-hash.sh:15-20`, `.gitignore:30-33`.

## Codebase Patterns

### 2026-08-31 — A skill's `description` is its entire trigger, and it under-covers its own body silently
**Cause:** `engineering-insights` had seven sections in its body but a `description` naming
four kinds of finding. `What Works`, `Codebase Patterns` and `Open Questions` were
unreachable — a session that only surfaced a convention, or only left an open question, never
invoked the skill, and nothing looked wrong from inside the file. The gap is visible only by
diffing the trigger clauses against the body; reviewing either half on its own misses it.
**Rule:** after editing any `SKILL.md`, map the `description`'s trigger clauses 1:1 onto the
branches the body handles — its sections, its routing rows, its ranked categories. Every
branch the body can handle needs a phrase that reaches it, and literal user phrasings ("wrap
up", "retro") belong in the text rather than left to paraphrase matching. Editing the body is
exactly when the `description` goes stale, because the body is what you are looking at.
**Evidence:** `.claude/skills/engineering-insights/SKILL.md:3` against its Step 5 table at
`.claude/skills/engineering-insights/SKILL.md:117`.

## Tool & Library Notes

### 2026-09-01 — A rarely-invoked skill loses its `description` to the listing budget, which makes it rarer still
**Cause:** `engineering-insights` under-triggered, and the wording was only half of it. Claude
Code loads a listing of every skill name plus description budgeted at 1% of the context window,
and when that overflows it drops descriptions **starting with the skills you invoke least**.
With ~30 skills installed here, the skill that fires least is first to lose the text that makes
it fire, so under-triggering feeds itself and the file looks fine from the inside.
**Rule:** front-load the trigger, do not pad. A `SKILL.md` may also carry `when_to_use:` — a
separate frontmatter field appended *after* `description` in the listing; both share one
1,536-char cap and truncation eats the tail, so put the imperative ("ALWAYS invoke when…") in
`description` and the trigger phrases and negative triggers in `when_to_use`, where losing them
costs least. Run `claude plugin validate .claude/skills` after any frontmatter edit: a
malformed `>-` block loads the body with **no** description at all, and that failure is
indistinguishable from ordinary under-triggering.
**Evidence:** `.claude/skills/engineering-insights/SKILL.md:3-24`.

### 2026-08-31 — A `PreToolUse` Bash hook that substring-matches the command fires on any command that merely mentions it
**Cause:** the gate matched `case "$cmd" in *"git push"*)`. The Bash tool hands the hook the
*whole* command string, heredoc bodies included, so writing a file whose **content** contained
those words was denied as though it were a push. The skill's own README tripped its own gate.
**Rule:** match at command position, never by substring — strip heredoc bodies and `#` comment
lines first, then require the verb after a segment boundary (`^`, `;`, `&&`, `||`, `|`,
newline), allowing env assignments and flags like `git -C dir`. Test the negatives (a heredoc
mentioning it, a `grep` for the literal, an `echo`), not just the positives; a matcher that
only ever sees real invocations looks correct right up until someone documents it.
**Evidence:** `.claude/skills/pr-self-review/scripts/check-gate.sh:40-63`.

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
