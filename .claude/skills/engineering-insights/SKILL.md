---
name: engineering-insights
description: Records non-obvious engineering findings — traps, silent failures, dead ends, and hard-won constraints — into the INSIGHTS.md of the module the work touched, with file:line evidence. Use proactively and without being asked, the moment work in this repo surfaces behaviour that a careful reader of the code could not have predicted, and again when wrapping up a task to catch findings that are only clear in hindsight.
allowed-tools: Read, Grep, Glob, Edit, Bash(git diff *), Bash(git status *)
---

# Engineering insights

Capture what the code and the READMEs cannot tell you, into the `INSIGHTS.md` of
the module the work touched. Runs in the background during any session — see
[examples.md](examples.md) for calibration on what clears the bar and what does not.

Append with `Edit` — never replace a file. `allowed-tools` only pre-approves the
tools so writing does not interrupt with a permission prompt; it restricts nothing,
so append-only is a rule to follow, enforced by review at commit time.

## When to fire

Fire mid-task, without being asked, when any of these happens:

- observed behaviour contradicts a doc, README, type signature, or comment
- something fails silently, or the cause appears nowhere in the error message
- a fix worked for a reason not visible at the site of the fix
- an approach was abandoned after real effort and the reason generalizes
- a constraint surfaced that will bite the next person — ordering, caching,
  generated files, env, cross-package contracts
- the same error appeared twice in one session

Do **not** fire for: routine edits that worked; tests passing; anything already
stated in `CLAUDE.md`, `README.md`, or `docs/`; general TypeScript / React /
Fastify / Drizzle knowledge; facts about the task currently in flight; user
corrections or anything else about the conversation rather than the code.

Over-firing is the likelier failure than under-firing. When genuinely unsure,
stay silent — a session that records nothing is the normal case.

Budget: at most **3 writes in flight per session**. Beyond that, hold findings
for the end-of-task sweep.

## The gate

Write only if the finding passes **all five**:

1. **Unpredictable** — a careful reader of the code could not have predicted it.
2. **Actionable cold** — a reader with no session context knows what to do.
3. **Evidenced** — carries a `file:line`, a command, or a real error string.
4. **Durable** — still true next month; not a one-time edit.
5. **Project-specific** — not general knowledge the model already has.

Then check it is not already said in `CLAUDE.md`, `README.md`, `docs/`, or a
package `README.md`. Never duplicate those — link the reader there instead.

## Where it goes

| Work touched | Append to |
|---|---|
| `server/**`, including `server/src/modules/repo-intel/**` | `server/INSIGHTS.md` |
| `client/**` | `client/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |
| Root config, `scripts/`, `docker-compose.yml`, `.github/`, either copy of `@devdigest/shared`, or anything true across two or more packages | root `INSIGHTS.md` |

Resolve the module from what the session actually changed — `git diff --name-only`
and `git status --porcelain` — not from what was merely read.

- `repo-intel` is **not** a top-level module. It lives at
  `server/src/modules/repo-intel/`, so its findings go to `server/INSIGHTS.md`.
- **Never read, write, or route into `server/clones/`.** It is DevDigest's own
  workspace and holds a full clone of this repo, including a second copy of every
  `INSIGHTS.md`. Exclude it from every glob and grep.

## Sections

Pick exactly one per entry:

| Section | Holds |
|---|---|
| What Works | An approach that proved out and should be reused |
| What Doesn't Work | Dead ends and antipatterns |
| Codebase Patterns | Conventions and architecture decisions in this module |
| Tool & Library Notes | Dependency quirks and version traps |
| Recurring Errors & Fixes | An error seen more than once, with the fix |
| Session Notes | One line per session, dated. Never more |
| Open Questions | Left unresolved, worth the next person's time |

**What Doesn't Work is the most valuable section and the most commonly skipped.**
A negative finding — this looks right and is not — saves more time than a
positive one. Prefer it when a finding could go either way.

## Entry format

```markdown
- **<Lead clause naming the trap>.** <What to do instead, actionable cold.>
  — `path/to/file.ts:120-134` (2026-08-01)
```

Session Notes uses `### YYYY-MM-DD` subheadings instead of bullets.

Match the house voice already used in `CLAUDE.md` gotchas and
`docs/agent-prompts/README.md`:

- lead with an absolute directive — **Never…** / **Always…** — where one applies
- give the *why* before the workaround; a rule without a reason gets ignored
- bullets, not paragraphs; one point per entry; wrap at ~80 columns
- cite evidence as `file.ts:120-134`
- no "warning signs" scaffolding on an already-obvious rule, no bad-example block
  for a trivial mistake

## Writing an entry

1. Read the target `INSIGHTS.md`.
2. Grep it for the same symbol or path. If the finding is already there, extend
   that entry instead of adding a second one; if it is already accurate, stop.
3. Append under the right heading with `Edit`.
4. Never delete or reword an existing entry. A finding that supersedes an older
   one is a **new dated entry that names the entry it corrects**.
5. Report in one line, then continue the task immediately:

```
› Noted in server/INSIGHTS.md → What Doesn't Work:
  silent cache overwrite in LocalSecretsProvider
```

No pause, no question, no summary block. The user reviews at commit time.

## End-of-task sweep

When wrapping up, re-check the session for findings that only became clear in
hindsight, and for held-back findings over the in-flight budget. Dedupe against
what was already written this session. If nothing clears the gate, write nothing
and say nothing.

## Never

- Record anything into this skill's own files, or about this skill.
- Replace a file. Append only.
- Write an entry with no evidence.
- Let a file grow past ~200 entries — signal drops. Split it by domain instead.
