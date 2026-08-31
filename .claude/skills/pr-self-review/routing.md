# Routing — diff scope and the file→skill map

How the orchestrator decides *what* to review and *which skills* to apply. Read with
[SKILL.md](SKILL.md) (procedure) and [gate.md](gate.md) (the gate).

## 1. Diff scope

```sh
BASE="$(git merge-base origin/main HEAD)"
```

"All open changes" is everything not yet on `main`, including the working tree:

| Source | Command |
|---|---|
| Committed-not-merged + staged + unstaged | `git diff "$BASE"` |
| Untracked files | `git ls-files --others --exclude-standard` |

Untracked files are reviewed with their full contents. A new `client/src/lib/utils.ts` is
precisely the misplacement `ui-architecture` exists to catch, and a plain `git diff` cannot
see it.

**Review added and modified lines only.** Do not flag pre-existing problems on lines the diff
does not touch, even inside a file it does touch. A self-review that blocks a PR for legacy
code the author did not write gets switched off within a week, and then it reviews nothing at
all. Bound every finding by the hunk ranges from `git diff "$BASE"`.

This matters concretely here: `onion-architecture` ships a table of **known violations in the
tree today** (`server/src/modules/pulls/routes.ts` and three others). Those are documented
backlog, not findings. Reporting them on an unrelated one-line change is the single most
likely way this skill becomes noise.

### Always skip

- `**/vendor/shared/**` — vendored, do-not-touch per `AGENTS.md`. *Exception:* still read for
  the contract-drift check in §4; never flagged for style.
- `**/db/migrations/**` — a merged migration is do-not-touch; a new one is reviewed by the DB
  bucket through the schema files, not by rewriting the SQL.
- `server/clones/**` — git-ignored runtime data.
- `node_modules/`, `dist/`, `.next/`, `build/`, `coverage/`, lockfiles.
- Pure docs: `*.md` / `*.json` carrying no executable code.

## 2. Buckets

| Bucket | Path globs |
|---|---|
| **UI / frontend** | `client/**/*.{ts,tsx,css}` |
| **Backend / domain** | `server/**/*.ts`, `reviewer-core/**/*.ts` |
| **Database** | `server/src/db/**`, new files under `server/db/migrations/**` |
| **Tests** | `**/*.test.{ts,tsx}`, `**/*.it.test.ts`, `e2e/**` |

Every changed `.ts`/`.tsx` file is *also* in the full-stack pass below, whichever bucket it
landed in.

## 3. Skill map

Only skills that exist in `.claude/skills/` appear here. Routing to a skill that is not
installed makes the run silently review less than it claims — check the directory before
adding a row.

### UI bucket
- `ui-architecture` — where code lives, file and folder naming, component splitting, App
  Router placement, import direction.
- `react-best-practices` — anti-patterns, hook rules, derive-don't-store. Ships its own
  CRITICAL/HIGH/MEDIUM labels; map them per [gate.md](gate.md) §2.
- `next-best-practices` — RSC boundaries, data fetching, server/client component rules.

### Backend bucket
- `onion-architecture` — layering and the dependency rule. Its
  `references/review-checklist.md` is written for exactly this job: seven checks, a
  "looks like a violation, isn't" list, and how to phrase a finding. Give the subagent that
  file by path rather than restating it.
- `fastify-best-practices` — routes, plugins, schema validation, error handling. Note it
  teaches a repository factory taking `FastifyInstance`, which is the *opposite* of what this
  repo does — `onion-architecture` wins where they disagree.

### Database bucket
- `drizzle-orm-patterns` — queries, transactions, schema definitions.
- `postgresql-table-design` — types, indexes, constraints. FK columns are not auto-indexed.

### Tests bucket
- `react-testing-library` — **style only, and never blocks.** A failing assertion is already
  caught deterministically in [gate.md](gate.md) §1; test style is not worth a blocked PR.

### Full-stack — runs on any changed `.ts` / `.tsx`
- `typescript-expert`, `zod`, and `security`.
- **`security` runs on every diff and is never routed away.** Its own body tells it to trace
  the input source and to suppress theoretical findings, so it is cheap on a clean diff.

### Always feed
The touched package's `INSIGHTS.md` — `client/`, `server/`, `reviewer-core/`, `e2e/`, or the
root one for config and CI changes. Those files record what already cost someone time in that
package; as review criteria they cost nothing to add.

## 4. Contract drift — a project-specific CRITICAL

`@devdigest/shared` contracts are vendored into **two** copies that are supposed to stay in
sync:

```
client/src/vendor/shared/contracts/*.ts
server/src/vendor/shared/contracts/*.ts
```

Flag CRITICAL when the diff touches one copy but not its twin, or when the pair differs for a
contract the diff touches:

```sh
diff "client/src/vendor/shared/contracts/<name>.ts" \
     "server/src/vendor/shared/contracts/<name>.ts"
```

**Scope this to contracts the diff actually touches.** Four pairs already differ in this tree
today — `eval-ci.ts`, `knowledge.ts`, `productionize.ts` and `trace.ts`, where the server copy
carries an `openrouter` provider and an `AgentManifest` the client copy lacks. A whole-tree
comparison therefore opens with four CRITICALs on every single PR, and the gate is dead on
arrival. Compare only what changed.

These files are do-not-touch by hand, so drift almost always means a regeneration step was
missed. Surface it; never patch one side to silence the check.

## 5. Repo rules — checked on every run, independent of the skill map

These come from `AGENTS.md` rather than from any skill, and they are mechanical rather than
matters of judgement. All are CRITICAL.

| Rule | Why |
|---|---|
| A `CLAUDE.md` is no longer a symlink to its `AGENTS.md` | They are committed symlinks; replacing one forks the instructions silently |
| An edit inside `server/clones/**` or `src/vendor/**` | Git-ignored runtime data, and vendored code that must be extended rather than edited |
| A modification to an already-merged `db/migrations/*.sql` | Merged migrations are immutable; add a new one |
| A new `tsconfig.json` path alias without the matching `vitest.config.ts` entry | There is no workspace resolver to inherit from, so tests break at runtime, not at typecheck |
| A lockfile from the wrong package manager | pnpm owns `server` and `client`; npm owns `reviewer-core` and `e2e`. Mixing breaks `--frozen-lockfile` in CI |
