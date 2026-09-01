# Insights — server

Lessons learned working in `@devdigest/api`. Append with `/engineering-insights`.
**Never rewrite or delete an entry** — correct an outdated one by adding a newer dated
entry that supersedes it. If a finding also concerns another module, write that module's
half in its own `INSIGHTS.md`. The root file is for root config and CI only.

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

_No entries yet._

## What Doesn't Work

_No entries yet._

## Codebase Patterns

### 2026-09-01 — `contracts/observability.ts` pre-reserves names (`AgentStats`, `StatPoint`) for A5's future `GET /agents/:id/stats` — grep before naming a new contract
**Cause:** Building the real `GET /agents/:id/stats` (Stats tab data) and naming its
result type `AgentStats` compiled — `export *` collisions across barrel files are silent —
but every caller of the merged type then resolved against whichever of the two same-named
exports TS picked, producing an unrelated-looking error (`runs: number` when the code
expected `runs: AgentRunHistoryRow[]`). `observability.ts` already declares `AgentStats`
(and `StatPoint`) as A5's scaffold for the exact same route, per the repo's stated pattern
of contracts/tables that "sit empty on purpose" for a future feature agent.
**Rule:** before naming a new exported contract type (especially one that mirrors an
existing route path like `/agents/:id/stats`), `grep` its name across
`src/vendor/shared/contracts/*.ts` first. If a name is already reserved by another
feature-agent's scaffold, pick a distinct name (this session used `AgentStatsDetail`)
rather than colliding — the barrel gives no warning either way.
**Evidence:** `src/vendor/shared/contracts/observability.ts:96` (the reserved
`AgentStats`), `src/vendor/shared/contracts/agent-stats.ts:38` (renamed to
`AgentStatsDetail` to avoid it), `src/vendor/shared/index.ts:28` (the `export *` that
made the collision silent).

### 2026-08-31 — The server's vendored contract copy runs ahead of the client's; four pairs differ right now
**Cause:** `src/vendor/shared/contracts/` and `client/src/vendor/shared/contracts/` are two
copies of the same contracts kept in sync by a regeneration step, and the server side is where
new work lands first. Today `eval-ci.ts`, `knowledge.ts`, `productionize.ts` and `trace.ts` all
differ — the server has an `openrouter` provider and an `AgentManifest` the client has never
seen.
**Rule:** changing a contract here is not done until the client copy is regenerated; treat the
client half as part of the same change. And when tooling compares the two copies, scope it to
the contracts the diff actually touches — a whole-tree comparison reports these four
pre-existing pairs on every run and drowns the real drift.
**Evidence:** `src/vendor/shared/contracts/productionize.ts:36` (`openrouter` present) vs the
client's `:36` (absent); `src/vendor/shared/contracts/eval-ci.ts:145` (`AgentManifest`).

### 2026-08-29 — A new field on the RunTrace document must be `.nullish()`, never `.nullable()`
**Cause:** `run_traces` stores the whole trace as ONE jsonb document, and old rows are
never migrated — so a trace written before a field existed has no such key at all, not a
null. `.nullable()` still requires the key to be present, so it rejects every historical
trace on read. This only shows up against old data, never in a fresh DB or in tests.
**Rule:** Fields added to `RunStats` / `RunTrace` are `.nullish()`, and the UI renders the
missing case. Only a field backed by a real `agent_runs` column may be `.nullable()` — the
`ALTER TABLE` backfills existing rows to NULL, so the key is always there.
**Evidence:** `src/vendor/shared/contracts/trace.ts:67` (`cost_usd` on RunStats, jsonb →
nullish) vs `:110` (`cost_usd` on RunSummary, a column → nullable);
`src/db/schema/runs.ts:50`.

## Tool & Library Notes

### 2026-08-31 — Fastify's global `bodyLimit` silently rejects a JSON-base64 upload well under its own decoded-size limit
**Cause:** `POST /skills/import` accepts a file up to 5 MB (`MAX_IMPORT_BYTES`,
`src/modules/skills/constants.ts:10`), sent as `{ filename, content_base64 }` JSON.
Base64 inflates by ~4/3, so a legitimate 5 MB file becomes a ~6.7 MB request body — well
over `app.ts`'s global `bodyLimit: 1_048_576` (1 MB), which rejects the request before the
route's own, correct, 5 MB check ever runs.
**Rule:** when an endpoint accepts binary data as base64 inside JSON, size against the
inflated (~4/3) request body, not the decoded application-level limit — and give that one
route its own `bodyLimit` override rather than raising the global default for every route.
**Evidence:** `src/app.ts:49` (the global 1 MB default), `src/modules/skills/routes.ts:67`
(`/skills/import`'s own `bodyLimit: 8 * 1024 * 1024` route option).

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
