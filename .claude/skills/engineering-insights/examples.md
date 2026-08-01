# Calibration

Worked examples for [SKILL.md](SKILL.md). The bar is high on purpose: a file of
vague entries costs context on every future session and changes no behaviour.

## Contents

- Vague vs useful
- One good entry per section
- Do not write these
- Sessions where the right move is silence

## Vague vs useful

✗ **"Promises can be tricky."**
✓ **`Promise.all()` on the ingest pipeline times out past 30 items.** Use
`Promise.allSettled()` in batches of 10 for that module — one slow item fails the
whole batch otherwise. — `ingest.ts:88-104` (2026-08-01)

✗ **"Be careful with the secrets file."**
✓ **Never hand-edit `~/.devdigest/secrets.json` while the API runs.**
`LocalSecretsProvider` caches it in memory and `set()` writes that stale cache
back, so the edit is silently overwritten. Restart, or use the Settings UI.
— `adapters/secrets/local.ts` (2026-08-01)

✗ **"Watch out for zod errors across packages."**
✓ **`instanceof z.ZodError` is always false across the reviewer-core boundary.**
The package resolves its own `zod` instance, so the constructor differs. Match by
shape — check `error.issues` — not by prototype. — `reviewer-core/src/schema.ts`
(2026-08-01)

The pattern: the useful version names the trap, says what to do instead, and
carries evidence. It is written for someone who arrives cold, with no memory of
this session.

> The three above are illustrations of *format*. Two of them already appear in
> `CLAUDE.md` files, so in a real session the duplicate check would reject them.
> Never copy a finding that a doc already states.

## One good entry per section

**What Works**
- **Reach for the DI container over direct imports in route modules.** Swapping
  the git client for a mock in tests needs no module mocking that way.
  — `platform/container.ts:91` (2026-08-01)

**What Doesn't Work**
- **Never mock `next-intl` per-test to trim namespace loading.** Messages load
  from `process.cwd()/messages` via `readdirSync` at request time, so the mock
  desyncs from what the server actually serves and the test passes against a
  fiction. Set the cwd instead. (2026-08-01)

**Codebase Patterns**
- **Cross-package imports resolve to raw `src/`, never build output.** A consumer
  breaks at boot with `ERR_MODULE_NOT_FOUND` if the producing package has no
  `node_modules` — install it even when only the server is being run.
  — `tsconfig.json` paths (2026-08-01)

**Tool & Library Notes**
- **`drizzle-kit generate` rewrites `meta/` snapshots wholesale.** Hand-editing an
  applied migration does not re-run it; the DB silently keeps the old shape.
  Generate a new migration instead. (2026-08-01)

**Recurring Errors & Fixes**
- **`ERR_MODULE_NOT_FOUND` on server boot means a sibling package is uninstalled**,
  not that an import path is wrong. Install in the named package and re-run.
  (2026-08-01)

**Session Notes**
```markdown
### 2026-08-01
Traced review-run stalls to the polling interval outliving the request scope.
```

**Open Questions**
- **Do the two `@devdigest/shared` copies still agree?** Nothing checks them and
  they have already drifted. Worth a diff before the next contract change.
  (2026-08-01)

## Do not write these

- **Restatements of `CLAUDE.md`** — the pnpm/npm split per package, the tsconfig
  alias rule, the two copied `shared` directories. Already documented.
- **General framework knowledge** — how RSC boundaries work, what `useEffect`
  does, why `await` inside a loop serializes. The model already has this.
- **Task narration** — "added a route for X", "renamed the handler". That is what
  the commit is for.
- **Volatile facts** — "the dev server is on port 3001 right now", "this test is
  currently failing". True today, misleading next month.
- **Anything without evidence.** A hunch with no `file:line`, command, or error
  string does not clear the gate. Put it in Open Questions or drop it.
- **The conversation itself** — corrections, preferences, what was asked for.
  `INSIGHTS.md` is about the system, not about the collaboration.

## Sessions where the right move is silence

**A feature lands cleanly.** Added a route, wired a hook, tests green, no
surprises. Nothing was unpredictable, so nothing is recorded. Say nothing — do not
manufacture an entry to look productive.

**A bug is fixed and the cause was in the error message.** A null check was
missing; the stack trace pointed at the line; the fix was obvious once read. The
next person hitting it reads the same trace and reaches the same place. No entry.

**A known gotcha is hit and it is already documented.** The server crashes at boot
with `ERR_MODULE_NOT_FOUND`; `reviewer-core/CLAUDE.md` already explains why. Follow
the doc, fix it, move on. Recording it again adds noise and creates a second place
to keep current.
