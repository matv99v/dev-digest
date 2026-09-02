---
name: engineering-insights
description: >-
  ALWAYS invoke the moment this session produces a durable engineering lesson — a
  correction the user gave you, an error hit twice, a dead end, a non-obvious cause, an
  approach that finally worked and should be reused, a tool/library/CLI behaving against
  its docs, an unstated codebase convention, an unresolved question — and ALWAYS again
  before finishing any session that edited files. DO NOT end, summarise, or hand back
  such a session without invoking this skill first. Invoking is MANDATORY; writing is not
  — the skill's own three gates decide, and "nothing durable" is a correct and common
  outcome, so invoking costs nothing. Appends the entry to the right INSIGHTS.md — the
  module's (client, server, reviewer-core, e2e), or the repo root's for config, CI,
  scripts, tooling and .claude/.
when_to_use: >-
  Trigger phrases: "wrap up", "retro", "we're done", "that's it", "anything worth
  recording?", "before you finish", /engineering-insights. Trigger unprompted when: the
  user corrects you; the same error appears twice in one session; you abandon an
  approach; a dependency or CLI behaves against its docs; you learn by reading a
  convention the code does not state. Do NOT trigger for a read-only question, an
  exploration that changed no files, a formatting or rename pass, a clean change that
  went exactly as expected, generic programming knowledge, a one-off unlikely to recur,
  or a lesson already written in README.md, TESTING.md, AGENTS.md, docs/ or an
  INSIGHTS.md.
allowed-tools: Read, Edit, Glob, Grep
---

# Engineering Insights

Capture what a session learned into the `INSIGHTS.md` it belongs to — the module it came
from, or the repo root when the subject is config, CI or the agent harness — so the next
session there starts with it instead of rediscovering it.

**Writing nothing is a correct and common outcome.** Most sessions teach nothing durable.
Do not manufacture an entry to look productive — a file of platitudes is worse than an
empty one, because it buries the entries that matter.

**Standing instruction for the rest of this session.** This skill's content stays in
context from here on, so treat it as standing, not as one pass. Re-run Step 1's three
gates before you finish, and before any commit or push. Say the verdict in one line even
when it is "nothing durable" — Step 4's dedupe makes a second pass safe, so the cost of
checking again is a sentence and the cost of not checking is a lost lesson.

## Step 1 — Decide whether to write at all

Three gates. **All three must pass.**

1. **Session gate.** Did this session actually contain problem-solving — a correction, an
   error, a dead end, surprising tool or library behaviour? A short Q&A, a clean change
   that went as expected, or a formatting pass produces nothing.
2. **Five-minute rule.** Would knowing this save 5+ minutes the next time someone meets
   it? If not, it is not worth a line.
3. **Obviousness test.** *"Would this be obvious to anyone reading the code?"* If yes,
   don't write it. The code already says it.

Never record:

- generic programming knowledge ("promises can be tricky")
- a one-time issue unlikely to recur
- anything already in `README.md`, `TESTING.md`, `AGENTS.md`, or `docs/`
- anything that needs paragraphs to explain — that is a `docs/` note, not an insight

If no candidate passes, say so plainly and stop. Do not open a file.

**Invoked mid-session, not at wrap-up?** The three gates are unchanged — but the moment is
better, because the evidence is still open in front of you and the `file:line` is exact.
Record it now, then return to the task; Step 4's dedupe stops it being written twice if
wrap-up comes round to it again. What the gates reject mid-session stays rejected — a
finding does not become durable just because the session later got long.

## Step 2 — Rank the candidates

When several things could be recorded, prefer them in this order:

1. **A correction the user gave you** — the strongest signal there is. It marks a gap
   between what the code implies and what the project actually wants.
2. A **repeated** error — the same failure hit twice in one session.
3. A tool, library, or CLI behaving in a way its docs don't lead you to expect.
4. A convention discovered by reading, that the code does not state.

Then **write at most two entries per invocation**, taken from the top of that list. A
third is almost always the first two restated, and a file is meant to hold ~30 entries in
total — not 30 from one session. What misses the cut is not lost: if it really matters it
will resurface, and then it ranks higher for having recurred.

## Step 3 — Route to the modules it concerns

| The finding concerns | Write to |
|---|---|
| code in one module | that module's `INSIGHTS.md` |
| code in two or more modules | **each** of those modules' `INSIGHTS.md`, split so every file states the part that matters there. Not the root |
| root config, CI, `scripts/`, lockfiles, tooling, or `.claude/` — not any module's code | `INSIGHTS.md` at the repo root |

Module files are `client/INSIGHTS.md`, `server/INSIGHTS.md`,
`reviewer-core/INSIGHTS.md`, `e2e/INSIGHTS.md`. `server/src/modules/repo-intel/` counts
as `server/`.

**Lessons about the agent harness itself are root** — a skill that misrouted, a hook that
over-matched, a settings or agent-definition quirk. They go to the root file even when the
work that surfaced them ran inside one module's code.

**Splitting a finding that spans modules.** Write what each module's next reader needs,
in that module's file, cited from that module's own code. Do not write the same sentence
twice, and do not park it in the root to avoid the second write. If the two halves come
out identical, the finding is probably about root config — put it in the root instead.

> A `vendor/shared` contract change that broke a client page becomes two entries:
> in `server/INSIGHTS.md`, that syncing the client's copy is part of changing a contract;
> in `client/INSIGHTS.md`, that a page failing on shape means checking whether the
> server's canonical copy moved. Different sentences, different evidence.

**Single-module tie-breaker:** when the finding really only concerns one module, route by
where the *cause* lives, not where the symptom appeared.

Root is chosen by **subject matter, not by how many modules were involved**. Four
affected modules still means four files — unless the subject is root config or CI.

## Step 4 — Read every target file, then dedupe

Read each target file in full before deciding anything. With a split finding that means
reading both before writing either.

Then `Grep` two or three distinctive terms from the finding — a filename, a symbol, an
error string — across **all five** `INSIGHTS.md` and across `README.md`, `TESTING.md`,
`AGENTS.md` and `docs/`. Two things this catches that reading the target alone cannot: the
same lesson already recorded in the *wrong* file (the likeliest duplicate, given how much
routing sits in Step 3), and a finding that is already documented prose — which Step 1
forbids recording, but which nothing until now actually checked.

- **An equivalent entry already exists in a target file** → stop. Write nothing. Say which
  entry covers it.
- **It is already in `README.md`, `TESTING.md`, `AGENTS.md`, or `docs/`** → stop. Those
  outrank this file; do not mirror them here.
- **An equivalent entry exists in the wrong file** → do not copy it across and do not edit
  it. Write the entry where Step 3 routes it, and say in Step 7 which stray entry it now
  duplicates, so a human can prune the old one.
- **One file already carries its half, the other doesn't** → write only the missing one.
- **A related entry exists and this session confirms it a second time** → promote its
  `Rule` into that package's `AGENTS.md`, leave the entry here untouched, and say so in
  Step 7. Edit `AGENTS.md` itself: the `CLAUDE.md` beside it is a committed symlink to it,
  and editing or replacing that symlink is forbidden repo-wide.
- **Nothing similar** → continue.

## Step 5 — Choose the section

| Section | Holds |
|---|---|
| `What Works` | An approach that solved something and should be reused here |
| `What Doesn't Work` | A dead end or antipattern, and why it fails **here** |
| `Codebase Patterns` | A convention the code follows but doesn't state |
| `Tool & Library Notes` | A dependency, CLI, or runtime behaving unexpectedly |
| `Recurring Errors & Fixes` | An error seen more than once, with its fix |
| `Session Notes` | One line for a session that produced an entry above |
| `Open Questions` | Something left unresolved, and what was already tried |

Two traps:

- **`Session Notes` is not a session log.** One line, only when the session produced a
  real entry. Replaying the conversation adds noise without signal.
- **`What Doesn't Work` is the most-skipped and most valuable section.** A recorded dead
  end saves the next session the whole detour. Reach for it before `What Works`.

**Architectural decisions with reasoning do not belong here** — they go in that module's
`docs/`, which exists for exactly that.

## Step 6 — Write the entry

Write out the **exact text** of the entry, not a summary of it, then append it —
**without asking for approval.** The gates in Step 1 are the approval. Stopping to ask
defeats a mid-session invocation, which promised to record and hand the task straight
back; the user sees exactly what was written in Step 7 and can overrule it there.

```markdown
### 2026-08-29 — one-line statement of the finding
**Cause:** what was actually wrong. Omit this line when nothing failed.
**Rule:** what to do or avoid next time. Required.
**Evidence:** `path/to/file.ts:42`. Required.
```

The date is **today's**, taken from the environment — never copied off the example above,
never guessed. `Evidence` must point at a real file and line you actually looked at. If
you cannot cite one, the finding is too vague to record.

`Session Notes` is the one section that does not take that shape. It gets a bare line, no
fields, and only when the session produced a real entry somewhere above:

```markdown
### 2026-08-29 — reworked the ingest retry path; the `allSettled` entry came out of it
```

### The quality bar

An entry must be actionable cold: someone reads it with no memory of this session and
knows what to do.

Ground every example in this repo, cited from files you opened. A borrowed example from
some other codebase fails its own `Evidence` rule.

| ✗ Noise | ✓ Usable |
|---|---|
| "be careful with path aliases" | "A new tsconfig path alias resolves for the API but not for tests — `server/vitest.config.ts` keeps its own `alias` map and there is no workspace resolver to inherit from, so both files need the edit." |
| "watch out for schema drift" | "A field the API plainly returns but the client schema rejects is drift, not your bug: `client/src/vendor/shared/contracts/` is a manual copy of the server's — diff the twin before touching it." |
| "StrictMode can be tricky" | "An effect that consumes a one-shot value is emptied by StrictMode's second dev invoke; guard it with a `useRef` keyed to its input — `client/src/lib/finding-target.ts:41`." |

## Step 7 — Report in one line

Close with a single line the user can check without opening anything: **what was written,
to which file and section, what was considered but skipped, and any `AGENTS.md` promotion.**
A promotion changes an instruction file every future session loads — never make it silently.

> Wrote one entry to `server/INSIGHTS.md` → `Tool & Library Notes`, and promoted the
> `reviewer-core` alias rule into `reviewer-core/AGENTS.md` (second hit). Skipped the
> StrictMode finding — `client/INSIGHTS.md` already covers it.

When the gates in Step 1 rejected everything, that line is the whole output: say nothing
was durable enough to record, and name the closest candidate so the user can overrule you.
Never end with a bare "done" — see rule 8 below for the partial-failure case.

## Never clobber

`INSIGHTS.md` is append-only. These rules are not advisory.

1. **Never use `Write` on an `INSIGHTS.md`.** It replaces the whole file. Use `Edit` only.
   This skill is not granted `Write` for that reason.
2. **Read the file immediately before editing.** Never edit from memory of an earlier read.
3. **One entry per `Edit` call.** Never batch two entries into one edit.
4. **Anchor every edit on the section heading**, so the insertion point is unambiguous.

   Into an empty section — the placeholder is the only thing replaced:

   ```
   old_string:
   ## What Doesn't Work

   _No entries yet._

   new_string:
   ## What Doesn't Work

   ### 2026-08-29 — one-line statement
   **Rule:** …
   **Evidence:** `src/x.ts:12`
   ```

   Into a section that already has entries — anchor on the heading **plus the first
   existing entry's heading line**, and re-emit that line unchanged:

   ```
   old_string:
   ## What Doesn't Work

   ### 2026-08-21 — the existing entry

   new_string:
   ## What Doesn't Work

   ### 2026-08-29 — the new entry
   **Rule:** …
   **Evidence:** `src/x.ts:12`

   ### 2026-08-21 — the existing entry
   ```

5. **Never delete or reword an existing entry.** If one is now wrong, append a **newer
   dated entry** that supersedes it and says which one it replaces. The old entry stays.
6. **If the anchor is missing or not unique — stop and report.** Never guess another
   insertion point, and never fall back to rewriting the file.
7. **Verify after writing.** Re-read the file: every `###` heading that was there before
   must still be there, and exactly one must have been added. Count by comparing the
   headings themselves, not a raw `^### ` tally — every file carries a template
   `### YYYY-MM-DD — one-line statement of the finding` inside an HTML comment near the
   top, which matches that pattern and is not an entry. It must survive untouched too.
8. **N target files means N separate `Edit` calls**, each anchored and verified on its
   own. If the anchor fails in the second file, say exactly which files were written and
   which were not — never a blanket "done".

## Maintenance

- Newest entry first inside its section.
- When an entry has bitten twice, promote its `Rule` into that package's `AGENTS.md` — the
  file itself, never the `CLAUDE.md` symlink beside it — and leave the cause here.
- Prune quarterly: drop entries for bugs since fixed, duplicates, and anything never
  needed again. Past roughly 30 entries in one file, split it by domain.
