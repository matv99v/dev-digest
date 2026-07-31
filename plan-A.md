# Consolidated session prompt — three steps, stubs only

## Context

This session reached its result through seven turns: an onboarding analysis, a
scaffold request, two rounds of "these files are too verbose, make them stubs", a
don't-touch-by-hand question, a filter on which findings were worth recording, and
a Read-when table cleanup.

The goal is a **single reusable prompt** that produces the same files in one shot.
Three corrections shape this revision:

1. **Every new file except `CLAUDE.md` is a bare stub.** `CLAUDE.md` is the only
   one carrying content, because being the roadmap is its entire purpose.
2. **Qualifying gotchas go into `CLAUDE.md`, not `INSIGHTS.md`** — so `INSIGHTS.md`
   stays a permanent stub that fills in organically, and the few load-bearing traps
   sit where they are read every session rather than behind a lazy pointer.
3. **The gotcha hunt is not its own step.** It only ever existed to fill one
   `CLAUDE.md` section, so it folds into the `CLAUDE.md` instruction. Three steps,
   one per deliverable.

## The prompt

```
Analyze this repo end to end, then do the following.

1. ONBOARDING BRIEF (chat only, no file). High-level architecture overview as if
   onboarding a new senior developer, plus every quirk or gotcha that is NOT
   visible from the code and NOT inferable from normal conventions: boot/env
   traps, cross-package wiring, silent-failure behaviour, and any place the docs
   contradict the code. Cite file:line.

2. CREATE CLAUDE.md — ~30 lines, a roadmap, not documentation. Sections: one-line
   project identity; "Source of truth" (read docs/, specs/, INSIGHTS.md before the
   codebase); "Read when"; "Conventions"; "Gotchas".

   Governing goal: it must never go stale. If a fact is documented anywhere else
   in the repo, write a pointer instead of restating it; reserve its own prose for
   facts documented nowhere else.

   "Read when" is a lazy trigger -> document table. Give the cross-cutting docs
   their own rows (INSIGHTS.md, README.md, TESTING.md, specs/) but collapse ALL
   per-package references into ONE row pointing at whichever package README applies.

   "Gotchas" covers files and flows that must never be hand-edited (generated,
   tool-managed, runtime state) plus any trap from step 1 — but only those a
   competent senior developer would actually get wrong: not documented anywhere
   else in the repo, not standard practice, and causing a silently wrong result
   rather than an error. One line each, three bullets at most. If nothing clears
   that bar, omit the section and say so.

   Use https://www.turbodocx.com/blog/how-to-write-claude-md-best-practices for
   general practice, but override it on three points: plain filenames, never
   @-prefixed imports (those load eagerly; everything must be lazy), and omit its
   recommended Commands and Project Structure sections (they duplicate README.md
   and will drift).

3. CREATE INSIGHTS.md, docs/README.md, specs/README.md as ~5-line stubs: purpose
   statement only. CLAUDE.md is the ONLY new file with real content — do not
   pre-fill these with templates, index tables, convention lists, or any findings
   from step 1. They fill in organically later.
```

## Why the Gotchas filter is worded that way

Without it, the natural output is the whole don't-touch list — lockfiles,
`.next/`, `dist/`, `next-env.d.ts`, migrations. All of that is either universal
practice or self-documenting at the point of use (`next-env.d.ts` says so in its
own second line; `modules/index.ts` opens with an `ADD A MODULE:` comment).
Restating it is exactly the staleness the file is built to avoid.

The "silently wrong rather than an error" clause is the sharpest part: it selects
for traps where the action appears to succeed. In this repo that left one item out
of a dozen candidates.

## Applying it to this repo

The four files already exist from this session. Re-running the prompt changes two:

- **`INSIGHTS.md`** — currently 19 lines holding the `~/.devdigest/secrets.json`
  silent-revert finding. Becomes a ~5-line stub; that entry **moves out**.
- **`CLAUDE.md`** — currently 35 lines. Gains a `## Gotchas` section carrying that
  finding as one line, so ~38-40. Slightly over the ~30 target, which is why the
  section is capped at three bullets.

`docs/README.md` (6 lines) and `specs/README.md` (5 lines) already match.

The finding that moves, condensed to a bullet:

> **Never hand-edit `~/.devdigest/secrets.json` while the API runs.**
> `LocalSecretsProvider` caches it in memory and `set()` writes the stale cache
> back — your edit is silently overwritten. Restart, or use the Settings UI.

## Verification

The prompt is the deliverable, so verification is a reproduction check on a fresh
clone:

1. Run the prompt in a new session against a clean checkout.
2. Confirm four files exist: `CLAUDE.md`, `INSIGHTS.md`, `docs/README.md`, `specs/README.md`.
3. `wc -l` them — expect ~30-40 / ~5 / ~5 / ~5.
4. Confirm `CLAUDE.md`'s "Read when" table has a single combined per-package row,
   and that no reference is `@`-prefixed (`grep -n '@' CLAUDE.md` should match only
   `@devdigest/shared` in Conventions).
5. Confirm any `## Gotchas` section is three bullets or fewer, and that each
   describes a silent failure rather than a convention.
6. Confirm the other three files contain a purpose statement and nothing else.
