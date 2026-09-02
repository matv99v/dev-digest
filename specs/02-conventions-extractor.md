# 02 — Conventions Extractor

## Goal

A user can scan a repo for its actual coding conventions, review each candidate against
real evidence in the code, accept or reject it, and turn the accepted ones into a skill
(or one skill per category) that attaches to an agent and runs on a real review — closing
the loop `specs/01-skills-in-the-product.md` left open when it named this "the other half
of L02."

## Scope

- Server: a `conventions` module — `GET/POST /repos/:id/conventions`,
  `POST /repos/:id/conventions/extract` (synchronous scan), `PATCH /conventions/:id`
  (accept/reject/edit), `GET /repos/:id/conventions/skill-draft`, and
  `POST /repos/:id/conventions/skills` to create skills from accepted candidates.
- Sampling is code-only (config files + `repoIntel.getConventionSamples()`); exactly one
  structured LLM call per scan; every candidate is verified against the actually-sampled
  file text before it is ever persisted.
- Client: a repo-scoped `/repos/:repoId/conventions` page — candidate cards with
  accept/reject/edit, a line-anchored GitHub link per candidate, and a Create-skill modal
  (merged or per-category) built from the accepted set.
- A migration extending the starter's unused `conventions` table with `status`,
  `category`, evidence line range, `scanned_sha`, and a `skill_id` back-link.

## Out of scope

- Attaching the generated skill to an agent from within this flow — the user does that
  from the agent editor's existing Skills tab (shipped in L02's other half).
- A background job / polling for the scan — it runs synchronously in the request; see
  *Design* below for why, and the fallback if that stops holding.
- Any change to `reviewer-core` — the `## Skills / rules` prompt slot this feature feeds
  already exists and is already fed by the skills half of L02.
- Non-English i18n, and any UI for editing a *rejected* candidate back to pending (reject
  is reversible only via re-editing status directly; no dedicated "undo" affordance).

## Design

The starter pre-declares more of this feature than usual for an "empty on purpose" table:
the `conventions` table, a `ConventionCandidate` contract (unused scaffold — this feature
adds its own `Convention`/`ConventionScan`/`ConventionSkillDraft` types in a new file
rather than repurposing it, since `server/INSIGHTS.md` warns that same-named `export *`
collisions are silent), a `conventions` entry in the per-feature model registry
(`FEATURE_MODELS`, defaulting to `openai/gpt-5.4`), `repoIntel.getConventionSamples()`,
and a mock LLM already keyed for a `ConventionExtraction` `schemaName`. This feature's job
was almost entirely to *feed* that plumbing, matching the pattern spec 01 used for skills.

- **Sampling is code, not model.** A fixed list of config files (`package.json`,
  `tsconfig.json`, eslint/prettier configs, `.editorconfig`) plus
  `repoIntel.getConventionSamples(repoId, 12)`, read through the `GitClient` port. Zero
  model calls in the sampling step — the model only ever sees text a human could have
  copy-pasted.
- **One structured call, then code-verified.** `completeStructured({ schemaName:
  'ConventionExtraction' })` returns raw candidates; `verifyCandidates()` (pure,
  unit-tested) drops any candidate whose file doesn't exist, whose line range is out of
  bounds, or whose snippet doesn't actually appear near the cited lines — snapping the
  range when the snippet is found at a nearby offset rather than dropping it outright.
  This is what makes "every candidate has evidence with real code" a property of the
  pipeline, not a UI convention.
- **Synchronous route, not a background job.** `JobRunner` has a hard 120s timeout and
  this codebase has no `GET /jobs/:id` status route — the existing job-polling pattern
  polls a *domain* status table (`repo_index_state`) that has no equivalent here, and
  building one for a single user-initiated, non-recurring action was judged not worth the
  surface area. Resilience is instead handled inline: the one LLM call is wrapped in
  `withRetry`/`withTimeout` from `platform/resilience.ts`, giving the same 429/5xx retry
  behavior `JobRunner` would have provided, without its timeout cap. Rows are committed to
  the DB before the HTTP response returns, so nothing is lost if the client navigates away
  mid-scan. If a large repo with a slow model starts timing out in practice, the fallback
  is `container.jobs.enqueue` + client polling, following `repo-intel/routes.ts`'s pattern
  — deferred until real usage shows it's needed.
- **Rejected candidates are structurally excluded from skill bodies.** `buildSkillDrafts()`
  filters to `status === 'accepted'` itself, so a caller cannot accidentally include a
  rejected or still-pending row in a draft — this is enforced in the pure composition
  function, not left to the route or the UI to get right.
- **Repo code is untrusted input to the prompt.** Sampled file content is
  delimiter-wrapped with `reviewer-core`'s `wrapUntrusted()` before being sent to the
  model, the same injection-guard convention the review pipeline already uses for diffs
  and PR descriptions — a comment in a sampled file cannot instruct the model to fabricate
  a convention.
- **One migration, not a new table.** The starter's `conventions` table only had
  `rule`/`evidence_path`/`evidence_snippet`/`confidence`/an `accepted` boolean — no reject
  state, no line numbers, no scan provenance, no link to the skill it became. Migration
  `0012` adds `category`, `status` (`pending`/`accepted`/`rejected`, replacing the old
  boolean), `evidence_line_start`/`evidence_line_end`, `scanned_sha`, `skill_id` (FK →
  `skills`, `on delete set null`), and `created_at`, plus indexes on `repo_id` and
  `workspace_id`.

## Files touched

Server:
- `server/src/db/schema/knowledge.ts` — extended `conventions` (see Design).
- `server/src/db/migrations/0012_ordinary_slyde.sql` — the one migration this feature needs.
- `server/src/db/rows.ts` — `ConventionRow`.
- `server/src/vendor/shared/contracts/conventions.ts` (new, mirrored into
  `client/src/vendor/shared/contracts/conventions.ts`) — `Convention`, `ConventionScan`,
  `ConventionSkillDraft`, `ConventionPatch`, `ConventionStatus`, `ConventionSkillDraftMode`.
- `server/src/modules/conventions/{routes,service,repository,sampler,helpers,constants}.ts`
  (new) — the module, mirroring `modules/skills/`'s shape.
- `server/src/modules/index.ts` — registers the `conventions` module.
- `server/src/modules/skills/service.ts` — `CreateSkillInput` gained `evidenceFiles?:
  string[]`, threaded through to the repository (which already accepted it).
- `server/src/prompts/conventions.system.md` (new) — the extraction prompt.
- `server/src/db/seed-conventions.ts` (new), `server/src/db/seed.ts` — 3 seeded rows
  (accepted/pending/rejected) for the demo repo.
- `server/test/conventions-helpers.test.ts`, `conventions-sampler.test.ts` (unit),
  `conventions.it.test.ts` (integration, Docker-backed).

Client:
- `client/src/lib/hooks/conventions.ts` — the React Query hooks (mirrors `hooks/skills.ts`).
- `client/src/app/repos/[repoId]/conventions/**` (new) — the page and its
  `ConventionsView` / `ConventionCard` / `CreateSkillModal` components.
- `client/src/components/skill-body-editor/` (new) — `SkillBodyEditor` promoted out of
  `app/skills/_components/` on its second consumer, per `ui-architecture`'s promotion
  rule; the two existing skills-editor importers were updated, the original deleted.
- `client/src/components/app-shell/nav.ts` — a `Conventions` entry in `SKILLS LAB`.
- `client/messages/en/conventions.json` — extended with reject/edit/modal copy (the
  starter's copy only covered an accept-only flow).
- Client tests: `ConventionCard.test.tsx`, `ConventionsView.test.tsx`, `helpers.test.ts`.

Also: `e2e/flows/09-conventions.flow.json`, `e2e/README.md` (coverage table).

## Verification

- `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- `cd server && pnpm exec vitest run .it.test` (needs Docker)
- `cd client && pnpm typecheck && pnpm test`
- `cd reviewer-core && npm test` — must stay green; this feature never touches the package
- `./scripts/e2e.sh` (runs `e2e/flows/09-conventions.flow.json` among the rest)
- Manual, end to end: `cd server && pnpm db:migrate && pnpm db:seed`, then `./scripts/dev.sh`.
  Pick a cheap model for **Conventions** in Settings → Models. Open a real, indexed repo's
  Conventions page and **Run extraction** — confirm candidates render with rule, category,
  confidence, and a code snippet. Click an evidence path and confirm GitHub opens the file
  at the cited line range, pinned to the scanned commit, matching the snippet shown. Reject
  one candidate, edit another's rule text, accept the rest, and confirm the states survive
  a reload. Open **Create skill**, confirm the composed body excludes the rejected
  candidate's rule, toggle to per-category and confirm one draft per category, then save.
  Confirm the new skill appears on `/skills` with `type: convention`, `source: extracted`.
  Attach it to an agent from the agent editor's Skills tab, run a review, and open the run
  trace's Prompt assembly to confirm a `Skills` block contains the conventions body
  unwrapped (`source: 'extracted'` is trusted, per `modules/reviews/helpers.ts`).
