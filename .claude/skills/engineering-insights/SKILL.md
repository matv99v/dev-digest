---
name: engineering-insights
description: Records a durable engineering lesson in the right module's INSIGHTS.md. Use when wrapping up a session that hit a non-obvious cause, a dead end, a correction, or a dependency quirk, and when the user asks to capture a lesson or insight. Covers routing to the correct module file, checking for an existing entry first, the seven fixed sections, the specificity bar, and append-only edits that never overwrite existing content.
allowed-tools: Read, Edit, Glob, Grep
---

# Engineering Insights

Capture what a session learned into the `INSIGHTS.md` of the module it came from, so the
next session there starts with it instead of rediscovering it.

**Writing nothing is a correct and common outcome.** Most sessions teach nothing durable.
Do not manufacture an entry to look productive — a file of platitudes is worse than an
empty one, because it buries the entries that matter.

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

## Step 2 — Rank the candidates

When several things could be recorded, prefer them in this order:

1. **A correction the user gave you** — the strongest signal there is. It marks a gap
   between what the code implies and what the project actually wants.
2. A **repeated** error — the same failure hit twice in one session.
3. A tool, library, or CLI behaving in a way its docs don't lead you to expect.
4. A convention discovered by reading, that the code does not state.

## Step 3 — Route to the modules it concerns

| The finding concerns | Write to |
|---|---|
| code in one module | that module's `INSIGHTS.md` |
| code in two or more modules | **each** of those modules' `INSIGHTS.md`, split so every file states the part that matters there. Not the root |
| root config, CI, `scripts/`, lockfiles, tooling — not any module's code | `INSIGHTS.md` at the repo root |

Module files are `client/INSIGHTS.md`, `server/INSIGHTS.md`,
`reviewer-core/INSIGHTS.md`, `e2e/INSIGHTS.md`. `server/src/modules/repo-intel/` counts
as `server/`.

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

- **An equivalent entry already exists** → stop. Write nothing. Say which entry covers it.
- **One file already carries its half, the other doesn't** → write only the missing one.
- **A related entry exists and this session confirms it a second time** → promote its
  `Rule` into that package's `AGENTS.md`, and leave the entry here untouched.
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

Propose the **exact text** of the entry, not a summary of it, then append it.

```markdown
### 2026-08-29 — one-line statement of the finding
**Cause:** what was actually wrong. Omit this line when nothing failed.
**Rule:** what to do or avoid next time. Required.
**Evidence:** `path/to/file.ts:42`. Required.
```

`Evidence` must point at a real file and line you actually looked at. If you cannot cite
one, the finding is too vague to record.

### The quality bar

An entry must be actionable cold: someone reads it with no memory of this session and
knows what to do.

| ✗ Noise | ✓ Usable |
|---|---|
| "Promises can be tricky" | "`Promise.all()` on the ingest pipeline times out past 30 items; use `Promise.allSettled()` in batches of 10 for this module." |
| "be careful with async" | "Checkout-flow state always goes through Zustand (`cartStore.ts`) because three components share the cart; local state breaks here." |
| "watch out for migrations" | "Schema changes must be pushed to BOTH dev and prod — `db:migrate` targets only the URL in the current `.env`." |

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
   must still be there, and exactly one must have been added.
8. **N target files means N separate `Edit` calls**, each anchored and verified on its
   own. If the anchor fails in the second file, say exactly which files were written and
   which were not — never a blanket "done".

## Maintenance

- Newest entry first inside its section.
- When an entry has bitten twice, promote its `Rule` into that package's `AGENTS.md` and
  leave the cause here.
- Prune quarterly: drop entries for bugs since fixed, duplicates, and anything never
  needed again. Past roughly 30 entries in one file, split it by domain.
