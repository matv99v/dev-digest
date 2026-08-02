# The gate

What blocks a PR, what merely reports, and how the hook knows a commit was reviewed.

## Why the CRITICAL set is small

Field data on how developers respond to review noise (see [README.md](./README.md)
finding 1): below a 10% false-positive rate every finding gets investigated; above 50%
developers "dismiss by default, and a finding only got read **if it blocked a merge**."

The blocking channel is the last one that survives noise. Every rule added to CRITICAL
spends that budget. So CRITICAL is **enumerated from named sources**, not defined by an
adjective — "breaks an invariant" is arguable at 6pm on a Friday; "the `security` skill
reported HIGH confidence" is not.

## Normalization

The skills use different scales. Map them onto three levels, aligned with SARIF's
`error` / `warning` / `note`:

| Level | SARIF | Comes from | Gate |
|---|---|---|---|
| **CRITICAL** | `error` | `react-best-practices` CRITICAL · `security` HIGH-confidence · `onion-architecture` CRITICAL or a `severity: 'error'` dependency rule · `frontend-ui-architecture` CRITICAL · `zod` CRITICAL · a broken `@devdigest/shared` contract | **BLOCKS** |
| **HIGH** | `warning` | any HIGH tier from a skill that declares tiers | reports |
| **MEDIUM** | `note` | everything from an untiered skill; any pre-existing issue in a touched file | reports |

**Gate rule:** `critical_count ≥ 1` → `⛔ BLOCKED`. HIGH and MEDIUM never block.

`security` deserves its own note: HIGH there means *"vulnerable pattern + attacker-controlled
input confirmed"* (`security/SKILL.md:18`) — a claim about evidence, not about how alarming
the pattern looks. That is why it is a blocking anchor while MEDIUM-confidence security
findings are not.

Skills that declare no tiers — `next-best-practices`, `fastify-best-practices`,
`drizzle-orm-patterns`, `postgresql-table-design`, `react-testing-library`,
`typescript-expert` — produce MEDIUM findings only. They cannot block. If one of them keeps
surfacing something that should block, the fix is to add tier markers to that skill, not to
special-case it here.

### The `@devdigest/shared` anchor is currently indirect

`vendor/shared/**` is on the exclusion list, so a change to a contract file is not reviewed
directly. This anchor therefore fires only *indirectly* — a consumer referencing a field
that does not exist, or the two copies disagreeing in a way that surfaces at a call site.

The twin-copy drift trap named in the root `CLAUDE.md` is **not** covered by this skill.
Recorded deliberately; revisit if drift bites.

## Clean as you code

**Only added and modified lines are gated.** Pre-existing problems in a file you touched
report at MEDIUM and never block.

This is not leniency, it is what keeps the gate usable. Sonar's rationale: "By focusing on
new code, you aren't responsible for anyone else's code," and broader conditions risk "an
**ignored quality gate**" because frequent failures start a debate about which conditions
matter ([README.md](./README.md) finding 3).

Concretely: `server/src/modules/pulls/routes.ts` has five known `onion-architecture`
violations today. Changing one unrelated line there must produce `✅ PASS`. Adding a *new*
inline query must produce `⛔ BLOCKED`.

## Exclusions

The highest-leverage part of this skill. Roughly 40% of false findings in AI review come
from a model failing to apply its own suppression rules, and another 30–42% from treating
config and tooling as production code ([README.md](./README.md) finding 2). Apply this list
twice — once when building buckets, once when consolidating.

**Skipped entirely** — not routed to any bucket:

- `**/vendor/shared/**` and `client/src/vendor/**` — vendored copies
- `node_modules/**`, `*-lock.yaml`, `*-lock.json`, `package-lock.json`
- `server/src/db/migrations/**` including `meta/` — generated; regenerate, never hand-edit
- `skills-lock.json` — generated
- `*.md`, and `*.json` files that are documentation or fixtures
- `server/clones/**` — a checkout of this repo; never review, never traverse

**Routed only to bucket-appropriate skills**, never production rules:

- test files and `e2e/**` → the Tests bucket
- `*.config.*`, `.github/**`, `scripts/**`, `docker-compose.yml`, `drizzle.config.ts` →
  reviewed for correctness only; never judged by architecture or component-placement rules

**Never flag as dead code** (root `CLAUDE.md`): empty database tables, unused i18n
namespaces, and vendored UI are placeholders for features not yet built.

**Path handling:** deleted files route nowhere. Renames route on the new path. A file
outside the four packages and outside this list gets reported once as "unrouted" rather
than silently ignored — an unrouted path usually means a new top-level directory that this
table has not caught up with.

## Grounding

A finding must cite a `file:line` present in the diff slice its subagent reviewed, or it is
dropped during consolidation. Fabricated references — nonexistent code, invented commit
hashes — are ~15% of observed false findings ([README.md](./README.md) finding 2), and this
is the cheapest defence against them.

The same rule already governs model findings in `reviewer-core` (`groundFindings`): cite a
line that exists in the diff or be discarded.

## Marker protocol

A `PreToolUse` hook runs a shell command; it cannot invoke a skill (see
[enforcement.md](./enforcement.md)). So it needs a record of whether a review happened and
what it concluded.

On completion, write `.git/pr-self-review.json`:

```json
{
  "sha": "9f2c1ab…",
  "verdict": "PASS",
  "criticalCount": 0,
  "dirty": false,
  "timestamp": "2026-08-02T14:22:11Z"
}
```

The hook allows the push only when **all** of these hold:

- `sha` equals `git rev-parse HEAD`
- `verdict` is `PASS`
- `dirty` is `false` **and** the working tree is still clean

`.git/` is the right home: untracked by construction, per-clone, and wiped with the clone.

The freshness conditions matter more than they look. The review covers uncommitted work, so
any edit afterwards means the verdict describes code that no longer exists. Committing
changes the sha; editing dirties the tree. Either way the marker goes stale and the review
re-runs — which is the correct default, because a stale PASS is worse than no marker at all.
