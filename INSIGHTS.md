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

### 2026-09-06 — An Acceptance line copied from an earlier plan named a test file that cannot produce the evidence it claims
**Cause:** `docs/plans/04-smart-diff.md:414` made T4's Acceptance *"`pnpm exec vitest run
test/routes-smoke.test.ts` sees `GET /pulls/:id/smart-diff` registered"* — copied in shape from
`docs/plans/02-pr-intent-layer.md:466` ("sees both routes registered"). `server/test/routes-smoke.test.ts`
holds four cases (`GET /health`, two `POST /settings/test-connection`, one 422 envelope) and **no
route-registry assertion of any kind**, so no run of it can see any route registered. It passes
regardless, which is exactly why nothing caught it: the implementer ran the named command, got a
green suite, and reported the task met in good faith. Only `plan-verifier` — which opens the named
file instead of trusting the command's exit code — found the line unverifiable as written.
**Rule:** an Acceptance line must name a command **and** an assertion that command actually runs.
Before writing "test X sees Y", open X and confirm the assertion is in it; a green suite is not
evidence for a claim it never makes. This binds hardest when the line is lifted from a previous
plan, where it reads as already-validated house style — the same failure as `routing.md`'s unchecked
globs below, one artefact along.
**Evidence:** `docs/plans/04-smart-diff.md:414` against `server/test/routes-smoke.test.ts:13-56`;
the phrasing it came from at `docs/plans/02-pr-intent-layer.md:466`.

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

## Tool & Library Notes

### 2026-09-06 — Whether a newly written `.claude/agents/*.md` is invocable in the same session is **not stable either way** — this refines both entries below
**Cause:** three new agent files (`brainstorm`, `investigator`, `insight-curator`) were written into an **existing** `.claude/agents/` that already held seven, `claude plugin validate .claude/agents` exited 0, and all three invocations still returned `Agent type 'x' not found. Available agents: architecture-reviewer, claude, claude-code-guide, doc-writer, Explore, general-purpose, implementer, Plan, plan-verifier, planner, researcher, statusline-setup, test-writer` — the seven committed agents, no new ones. A second attempt minutes later returned the same list. So the 2026-09-04 entry below is too broad in the other direction: on 2026-09-04 four new files became available immediately; on 2026-09-06 three did not, in the same repo, with the directory already populated — which is *not* the documented "first agent file in a new `agents` directory" exception. What differs between the two runs was not established.
**Rule:** treat same-session invocability as **unknown until you try it** — neither "restart required" nor "hot-reload works" is a property you may assume. Keep writing the invocation as the check (that part of the entry below holds), and when it returns `Agent type 'x' not found`, record it as this-run evidence about the roster and **stop there**: validate exited 0, the frontmatter is not the cause, and editing the file in response is the actual trap. A plan whose Acceptance requires a live invocation must state that outcome as a legitimate result, not as a failure to fix.
**Evidence:** `.claude/agents/investigator.md:1-5` written and validated this session; the "not found" list above names only the seven files from commit `e972b72`. Refines `INSIGHTS.md:109` and `INSIGHTS.md:141`.

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

### 2026-09-05 — A superseded `INSIGHTS.md` entry gets re-cited as fact, because the correction sits above it and the stale entry reads as self-contained
**Cause:** a `researcher` subagent, asked to establish this repo's agent-authoring conventions, quoted `INSIGHTS.md:141` ("a new `.claude/agents/*.md` cannot be invoked in the session that wrote it") into its report as an established fact with a locator. The correction is `INSIGHTS.md:109` — same section, 32 lines above, heading ending "this supersedes the entry below" — and the researcher never reached it: a Grep lands on the matching entry, and that entry carries nothing saying it is dead, because append-only forbids editing it. Second time this same false rule has propagated into a planning artefact; `docs/plans/01-agent-suite-four-subagents.md` was the first, and the superseding entry already records that.
**Rule:** treat any `INSIGHTS.md` entry as provisional until you have read the rest of its section top-down — newest first, so a supersession is always *above* the entry it kills, and the stale entry can carry no back-reference to it. A Grep hit alone is not a citation. This binds hardest on a read-only subagent, whose report becomes the caller's ground truth without the caller re-reading the source.
**Evidence:** `INSIGHTS.md:109` supersedes `INSIGHTS.md:141`; both sit in `## Tool & Library Notes`.

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
