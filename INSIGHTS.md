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

### 2026-09-04 — Citing a file to a subagent "for the house style" is how its *content* gets left out of the brief
**Cause:** the `planner` brief pointed at `implementer.md` as "the house style for an agent body:
frontmatter shape, `# Role`, hard rules, method, output template", and the briefer had read only
its first 60 lines. `# Per-module rules` (`implementer.md:99-114`) carries this repo's actual
invariants — ports resolved from `src/platform/container.ts`, `groundFindings()` mandatory with
the model's self-reported score ignored, every domain query scoped by `workspaceId`,
`vendor/shared` never edited in place. Those are exactly the criteria a review agent needs, and
none reached the plan. The pattern is exact: every agent whose brief named an in-repo **content**
source ("`TESTING.md` — build it on this") got that content; the one whose brief named only
skills as its criteria got only skills. Nothing looked wrong afterwards — the plan came back long,
cited and with its own red-flags check all `pass`, because completeness *inside* a frame says
nothing about what the frame omits.
**Rule:** read in full any file you cite to a subagent as an exemplar — the tail is where the
content lives, and style lives in the head you were sampling. Then say **what to take from it**,
not what it resembles. A brief that names a file without naming what to extract has assigned no
source at all.
**Evidence:** `.claude/agents/implementer.md:99-114` against `docs/plans/01-agent-suite-four-subagents.md:206-294`.

### 2026-09-04 — `pr-self-review/routing.md`'s path globs are prose, not validated references, and one is already wrong
**Cause:** its Database bucket routes on `server/db/migrations/**`. That directory does not
exist — migrations live in `server/src/db/migrations`. The file reads authoritatively and is
the obvious thing to copy a bucket map out of, so the wrong glob propagates into whatever is
written next; it reached two agent drafts here before anyone checked it against the tree.
**Rule:** verify every path glob and skill name copied out of `routing.md` against the actual
tree before reusing it. That file itself warns that routing to an uninstalled skill "makes the
run silently review less than it claims" — its own globs fail exactly the same way, and
nothing validates either.
**Evidence:** `.claude/skills/pr-self-review/routing.md:50` against `server/src/db/migrations`.

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

### 2026-09-04 — An agent or skill file says nothing about where to look in this repo — not even as a pointer
**Cause:** `researcher.md` was drafted with its own "where to look" list (the four packages, the
config files, the banned paths), corrected to a pointer at the root `AGENTS.md`, and corrected
again to neither. Both drafts were wrong for one reason: the repo's instruction files are
already loaded, the model follows them without being told to, and every sentence a skill spends
describing them is a second copy that nothing keeps in sync.
**Rule:** a `.claude/agents/*.md` or `SKILL.md` states **method** — the order to work in, how
much of a file to read, which tools are off limits, what the output must contain — and says
nothing about which package holds what, which file to read first, or what is forbidden to open.
If an agent genuinely navigates wrong, fix `AGENTS.md`; do not patch around it inside the skill.
**Evidence:** `.claude/agents/researcher.md:73-77` — the project-mode method is three lines
and names no package, no path and no prohibition.

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

### 2026-09-04 — A newly written `.claude/agents/*.md` **is** invocable in the session that wrote it — this supersedes the entry below
**Cause:** the earlier entry ("A new `.claude/agents/*.md` cannot be invoked in the session that
wrote it") generalised one `Agent type 'researcher' not found` into a rule that the roster is
frozen for the life of the session. It is not. After four new agent files were written this
session, the harness announced all four as available agent types immediately, and `plan-verifier`
was then really invoked and started work — it failed later on an opus rate limit, not on "not
found". The false rule is expensive because it is *load-bearing*: it had already propagated into
`docs/plans/01-agent-suite-four-subagents.md` §`Testing strategy` and into the brief of all three
implementer lanes, each of which was told live verification was impossible and not to attempt it.
**Rule:** after writing an agent file, **try invoking it** before declaring it unverifiable. A
real `Agent type 'x' not found` is still possible and still is not a YAML error — but treat it as
this-run evidence, not as a standing property of the session. Never write "verifiable only after
a restart" into a plan's Acceptance; write the invocation as the check.
**Evidence:** `.claude/agents/plan-verifier.md:1-6` written this session and invoked in it;
superseded entry at `INSIGHTS.md:141`.

### 2026-09-04 — A subagent's `skills:` preload is a guarantee; "load this skill first" in its body is only a request
**Cause:** `implementer` was first drafted with a `Type` → skills table in its body and an
instruction to load that set through the `Skill` tool before editing. That is unenforceable
prose — the same defect as telling an agent its body "hard-restricts" `Write` to one
directory. Only `skills:` frontmatter injects the content unconditionally; a `Skill` call is
a decision the model can silently skip, and nothing reports the skip.
**Rule:** when a skill set is mandatory rather than advisory, preload it with `skills:`, and
measure what that costs — the full set here is 2740 lines / 125 KB / ~31k tokens per
invocation. Do **not** trim it by splitting the agent per bucket: that was built and reverted,
because two agents sharing ~90% of their body is a guaranteed silent-drift point worth more
than the tokens it saves, and the planner needs both sets anyway. Trim instead by moving a
skill whose need is *stated in the task* — a test, a diagram — to an on-demand `Skill` call,
and keep the preload for the rules a task never mentions.
**Evidence:** `.claude/agents/implementer.md:6-18` — 12 skills preloaded; the `Type` table at
`:48` is emphasis only, never a load instruction.

### 2026-09-04 — A new `.claude/agents/*.md` cannot be invoked in the session that wrote it, and the error blames the file
**Cause:** after creating `.claude/agents/researcher.md`, invoking it returned `Agent type
'researcher' not found. Available agents: claude, claude-code-guide, Explore, …`. The
frontmatter was fine — `name`, `description`, `tools`, `model` all parsed. Claude Code reads
agent definitions **once at session start**, the way it reads the skill listing, so the roster
is frozen for the life of the session. The message names the file's own `name:` value, which
reads exactly like the malformed-`>-` failure recorded in the entry below, and sends you
debugging YAML that is already correct.
**Rule:** a newly written agent is verifiable **statically only** until the session restarts —
parse the frontmatter and check the section structure, then say plainly that the live
invocation needs a new session, rather than editing the file in response to "not found". Same
trap as skills: creating the definition is not the same as loading it.
**Evidence:** `.claude/agents/researcher.md:1-18`.

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
