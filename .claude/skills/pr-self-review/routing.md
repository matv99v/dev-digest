# Routing

How changed paths become buckets, and what each subagent is told.

## Bucket globs

Evaluated in order. A file may match more than one bucket — it is reviewed by each, and
dedupe reconciles the results.

| Bucket | Matches |
|---|---|
| **UI / frontend** | `client/**/*.{tsx,ts,css}` |
| **Backend / domain** | `server/src/**/*.ts`, `reviewer-core/src/**/*.ts` |
| **Tests** | `**/*.test.ts`, `**/*.test.tsx`, `**/*.it.test.ts`, `e2e/**`, `server/test/**` |
| **Config** | `**/*.{yml,yaml,toml,json}`, `*.config.*`, `.github/**`, `scripts/**`, `Dockerfile*`, `docker-compose*` |
| **Full-stack** | see the sub-routing below |

**Every bucket matches source extensions, never a bare directory.** `server/**` looks
right and is wrong: it drags `pnpm-workspace.yaml`, `.env.example`, and every YAML in the
package into architecture review, which is the config-as-production mistake that accounts
for 30–42% of false findings ([README.md](./README.md) finding 2). Verified against a real
77-file diff, where `server/**` pulled in `server/pnpm-workspace.yaml`.

Match order is **Tests → Config → UI/Backend → Full-stack**. Tests first so a test file
never reaches a production-rule skill; Config next so a `.yml` under `server/` is never
judged by `onion-architecture`.

The Config bucket is reviewed for correctness and secrets only — never by architecture,
component-placement, or ORM rules. It has no skill list of its own; findings there come
from `security` when a secret or credential appears, and are otherwise MEDIUM.

A path matching nothing is reported once as **unrouted** rather than silently dropped. That
usually means a new top-level directory this table has not caught up with — a signal to
update it, not to ignore the file.

### Full-stack sub-routing

Not "every TypeScript file". Each skill has its own trigger:

| Skill | Fires on |
|---|---|
| `typescript-expert` | any changed `.ts` / `.tsx` — the fallback |
| `zod` | `**/contracts/**`, `**/*.schema.ts`, any file whose diff imports `zod` |
| `security` | `**/routes.ts`, `server/src/adapters/{auth,secrets}/**`, `server/src/platform/config.ts`, and any hunk handling user input, auth, tokens, file paths, or shell/SQL construction |

`security` is deliberately narrow. Running it over every changed file means running it over
config and tooling, which is where a large share of false findings come from — see
[README.md](./README.md) finding 2.

## Skills per bucket

| Bucket | Skills |
|---|---|
| UI / frontend | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices` |
| Backend / domain | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design` |
| Tests | `react-testing-library` |
| Full-stack | `typescript-expert`, `zod`, `security` — per the sub-routing above |

**Never routed: any skill whose Scope is `Shared`** — `mermaid-diagram`,
`engineering-insights`, and `pr-self-review` itself. Shared-scope skills are authoring and
workflow tools; they hold no rules a diff can violate, and routing to `pr-self-review` would
recurse.

The **Scope** column of [`../README.md`](../README.md) is the source of truth for which
domain a skill belongs to. A newly added skill joins the router by declaring its scope
there; check that table when the skill list looks out of date rather than trusting this
one.

### Narrowing inside a bucket

Some skills only apply to part of their bucket. Give the subagent the whole bucket, and
these hints:

- `postgresql-table-design` — only `server/src/db/schema/**` and migration-adjacent changes
- `drizzle-orm-patterns` — only `repository.ts`, `**/*.repo.ts`, `server/src/db/**`
- `next-best-practices` — only `client/src/app/**`
- `fastify-best-practices` — only `routes.ts` and `server/src/app.ts`

## Subagent prompt template

Spawn one `general-purpose` subagent per non-empty bucket, all in a single message so they
run in parallel. There are no pre-registered reviewer agents in this repo, so the
instructions travel in the prompt.

```
You are reviewing one bucket of a local diff before a pull request is opened.

BUCKET: <UI | Backend | Tests | Full-stack>

FILES IN SCOPE (review nothing outside this list):
<path> — added lines <n-m>, modified lines <n-m>
…

SKILLS TO APPLY — invoke each with the Skill tool and follow it:
<skill-name>  (applies to: <narrowing hint, or "the whole bucket">)
…

HOW TO REVIEW
- Read the diff for your files: `git diff <BASE> -- <paths>`
- Judge ONLY added and modified lines. Pre-existing problems in a touched file may be
  reported at MEDIUM, never higher — the author owns what they wrote, not the file's history.
- Every finding must cite a file and line that exists in your diff. If you cannot point at
  one, drop the finding. An unverifiable finding is worth less than no finding.
- Severity comes from the rule you applied, not from how it feels: use the tier on the rule's
  heading in the skill (CRITICAL / HIGH / MEDIUM). If the skill states no tier, use MEDIUM.
- Report broadly. Do NOT self-censor to keep the list short — the orchestrator dedupes and
  filters. Missing a real defect costs more here than reporting a borderline one.
- Do not edit, format, or fix anything. The diff is about to become a PR; changing it
  invalidates the review that is running.

RETURN
A JSON array of findings and nothing else — no prose, no summary, no markdown fence.
An empty array is a valid, useful answer.

[
  {
    "file": "server/src/modules/pulls/routes.ts",
    "line": 223,
    "level": "CRITICAL",
    "ruleId": "onion-architecture/rings#the-failure-to-recognise-on-sight",
    "skill": "onion-architecture",
    "label": "issue",
    "message": "Transport composing SQL — pr_files has no owning repository",
    "fix": "Move the insert into modules/pulls/repository.ts"
  }
]
```

## Finding contract

Field names follow [SARIF](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html)
where one exists, so emitting real SARIF for GitHub code scanning later is a formatting step
rather than a redesign.

| Field | Meaning |
|---|---|
| `file` | Repo-relative path, must be in the bucket's scope list |
| `line` | 1-indexed, must exist in the diff |
| `level` | `CRITICAL` / `HIGH` / `MEDIUM` — SARIF `error` / `warning` / `note` |
| `ruleId` | `<skill>/<file>#<heading-slug>` — what makes severity reproducible |
| `skill` | Which skill produced it |
| `label` | Conventional Comments label: `issue`, `suggestion`, `nitpick`, `note` |
| `message` | One sentence, the defect itself |
| `fix` | The concrete change, not "consider refactoring" |
| `agreedBy` | Added by the orchestrator during dedupe — every skill that reported it |

`ruleId` is the field that carries the most weight. Severity is assigned **by rule**, so the
same violation tiers identically on Monday and Friday; without it, each run re-litigates how
bad the finding feels.
