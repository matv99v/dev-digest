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

_No entries yet._

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
