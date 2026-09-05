# 03 — PR Intent Layer

## Goal

A user opening a PR's Overview tab sees an INTENT card stating what the PR is trying to
do, what is in scope, what is explicitly out of scope, the evidence the statement was
built from, and a confidence level — with a **Derive intent** button that recomputes it
on demand. Every review run started from that PR carries a `## Intent` section in the
prompt sent to each agent, derived once as shared pre-work and reused across all agents
in the run, and that exact block is inspectable afterwards as its own row in the run
trace's Prompt assembly panel. Today a review sees the diff, the repo map, the callers
digest and the raw PR body, but never *why* the PR exists — so it cannot tell a
deliberate scope decision from an omission. This closes that gap.

## Scope

- `pr_intent` persists, per PR: the intent narrative, in-scope and out-of-scope lists, a
  `confidence` of exactly `high|medium|low`, the ordered evidence `sources`, the
  `derived_from_sha`/`derived_at` used for staleness, and the model/provider/tokens/cost
  of the call that produced it — added by widening the existing empty table with one
  migration.
- `GET /pulls/:id/intent` reads the cached row and never derives; `POST
  /pulls/:id/intent` always derives and upserts. Both are tenancy-scoped and 404 for a PR
  outside the caller's workspace.
- A best-effort derive step runs once inside `ReviewRunExecutor`, before the per-agent
  loop: reuses a fresh cached intent with zero LLM calls, or derives with one
  `completeStructured` call against the existing `review_intent` model registry entry.
  Derivation failure never fails the review; the run proceeds without the `## Intent`
  section.
- Confidence is computed in code from the evidence actually gathered (a resolved
  in-repo doc, a linked issue matched by a documented closing keyword, or prose body
  length) — never read from model output.
- Scope entries that look like a repo path are dropped unless they prefix-match a
  changed file in the PR; free-form prose entries pass through unchanged.
- Document resolution reads **in-repo markdown only**, from the clone, under an
  allow-listed set of doc roots — no external HTTP.
- A plan or spec is taken into account whether it is **linked** or **pasted inline**. A PR
  body — or a linked-issue body — carrying the structure of this repo's own plan/spec
  templates is detected as such, is exempt from the ordinary prose cap so it is not
  truncated mid-document, is recorded as its own source kind, and raises confidence to
  `high` on the same footing as a resolved in-repo doc.
- `reviewer-core`'s `assemblePrompt` gains a `## Intent` section (wrapped untrusted,
  between `## PR description` and `## Skills / rules`) and one `assembly.intent` field;
  the Prompt assembly panel renders it as a distinct **Intent** row.
- The PR Overview tab renders the INTENT card, including its empty state (no intent yet)
  and its stale state (head moved, or description edited without moving the head).

## Out of scope

- **`fs.realpath` containment inside `GitClient.readFile`** — the one unmitigated
  security gap in this feature (a symlink committed into the reviewed repo can escape a
  string-level path check). It is adapter-wide, would affect every existing reader
  (repo-intel, conventions, this module), and needs its own task and test matrix rather
  than riding in on this diff.
- **A total-spend view** summing `agent_runs.cost_usd` with `pr_intent.cost_usd` — this
  feature is the only place those two figures could be combined, and no screen does that
  today; adding one is a separate, unrequested change.
- **`pr_description` as its own Prompt assembly panel row** — it is already missing from
  that panel today, and fixing that alongside this feature would make this diff harder
  to review for what it actually changes.
- **`model-router.ts`** — it has a matching `'intent'` task type and zero callers, but
  using it would route around `resolveFeatureModel` and silently ignore the workspace's
  configured model, and its `Provider` union is missing `'openrouter'`. Left as-is:
  neither adopted nor deleted, matching the repo's rule against deleting unfed scaffolds.
- **Feeding intent into `pr_brief` / a future `PrBrief` composer** — the contract is
  deliberately shaped so that composer *can* consume it later (see Design), but
  `pr_brief` has no producer yet, so no composer code is written now.
- **A new `FEATURE_MODELS` entry, a settings field, or a default model change** — the
  existing `review_intent` entry is reused exactly as it ships.
- **External HTTP for linked documents or issues beyond the existing GitHub port** —
  document resolution is in-repo markdown only, read from the clone.
- **An e2e flow** — the user-visible surface is one card and one drawer row, both
  covered by component tests against a mocked `fetch`; an e2e flow would need a seeded
  intent row and a stubbed model in the hermetic stack, which is more scaffolding than
  the coverage is worth.

## Design

The starter pre-declares this feature more completely than usual for an "empty on
purpose" table, and on both ends: the `pr_intent` table, its repository accessors
(`pull.repo.ts:49`, `:64`), the `Intent` contract, the `PrIntentRecord` DTO, and a
`review_intent` entry in `FEATURE_MODELS` all shipped with zero producers.
`run-executor.ts:39` and `run-logger.ts:16` already carry docblocks claiming the run
"loads the diff + intent once" — a claim that is false until this feature lands.
`reviewer-core`'s `INJECTION_GUARD` already names "derived intent/scope" as untrusted
data it must not let descope a review. This feature's job is almost entirely to *feed*
that plumbing, the same pattern `02-conventions-extractor.md` used for the `conventions`
table — stronger here, because two existing docblocks are actively lying about behaviour
that doesn't exist until this ships.

- **Confidence is computed, never modeled.** The model-output schema (`RawIntent`) has
  exactly three fields — `intent`, `in_scope`, `out_of_scope` — and no confidence field
  at all; `computeConfidence` is a pure function of the evidence actually gathered
  (a resolved doc, a closing-keyword-matched issue, or prose length). Rejected: a
  model-reported `0..1` float, which would render indistinguishable from the grounded
  confidence floats this repo already shows (`findings.confidence`,
  `conventions.confidence`) while being the one number with no ground truth behind it —
  the same lesson L02's `verifyCandidates` already applied to unverifiable model output.
  Cost accepted: a model genuinely unsure about a well-documented PR still yields
  `high`, because here `high` means "grounded in a document", not "the model feels
  certain", and the card's source list makes that distinction legible.

The relationship below is the one readers get wrong: these are **two separate LLM calls**
against independently-resolved models, and the first's output becomes one block inside
the second's single combined prompt.

```mermaid
sequenceDiagram
  participant Exec as run-executor.ts
  participant Svc as IntentService
  participant Cache as pr_intent row (keyed on head_sha)
  participant LLM1 as LLM #1 — review_intent model
  participant Prompt as assemblePrompt (reviewer-core)
  participant LLM2 as LLM #2 — per-agent review model

  Exec->>Svc: deriveForRun(...) — best-effort, before the per-agent loop
  Svc->>Cache: isIntentFresh? — same head_sha AND derived_at >= updated_at
  alt cache fresh
    Cache-->>Svc: cached narrative — zero LLM calls
  else stale or missing
    Svc->>LLM1: completeStructured(schemaName: IntentDerivation)
    LLM1-->>Svc: RawIntent — intent, in_scope, out_of_scope only; no confidence field
    Svc->>Cache: upsert narrative + derived_from_sha + tokens/cost/model
  end
  Svc-->>Exec: intent: string | undefined — never throws
  Exec->>Prompt: reviewPullRequest({ ...intent }) — one intent, reused across every agent
  Prompt->>Prompt: one combined prompt — "## Intent" wrapped untrusted, between PR description and Skills/rules
  Prompt->>LLM2: the combined prompt, sent once per agent
  LLM2-->>Prompt: findings
```

LLM #1 and LLM #2 are resolved independently — `review_intent`'s configured model has no
relationship to whichever model a given review agent uses.

- **The derive step is best-effort, never blocking.** Inserted into `run-executor.ts` as
  a hand-written `try/catch` around the derive call, logging `runLog.info` on both
  success and failure. Rejected: `runLog.step`, which re-throws *and* emits an `error`
  event — painting the Live Log red on a benign degradation; and `failAll`, which exists
  for pre-work without which no review is possible at all, which intent derivation is
  not. A missing `IntentDerivation` mock fixture, or a workspace with no key for
  `review_intent`'s provider, must still let every queued run reach `status='done'`.
- **Cost lands on `pr_intent`, not `agent_runs`.** The one shared derive call's
  tokens/cost/model/provider are recorded on the `pr_intent` row and nowhere else.
  Rejected: splitting the cost across every fanned-out agent's `agent_runs` row (would
  multiply spend by the agent count for a single shared call), or crediting it to only
  the first agent (two identical agents would show different costs), or inventing an
  `agent_runs` row meaning "pre-work" (would surface as a phantom run in the PR's
  history). Accepted consequence: total spend for a run is
  `sum(agent_runs.cost_usd) + pr_intent.cost_usd`, and no screen sums that today (see
  *Out of scope*) — the Live Log instead carries a visible `intent: derived via
  <provider>/<model> — …tokens, $…` line persisted into every target run's trace.
- **No `workspace_id` on `pr_intent`.** It is a satellite keyed 1:1 on
  `pull_requests.id` via a PK that is also a cascading FK, like `findings`, `pr_files`,
  `pr_commits` and `pr_brief` — unreachable except through a parent that already carries
  `workspace_id`. Rejected: duplicating `workspace_id` onto the table, which would be a
  denormalization no constraint keeps in sync — it could drift silently while giving a
  false sense of a DB-enforced boundary. The boundary is instead enforced one layer up:
  every entry point resolves `workspaceId`, then loads the parent through the
  already-scoped `getPull(workspaceId, prId)`, throwing `NotFoundError` before any
  `pr_intent` statement runs — recorded in the repository docblock beside the intent
  methods and in the migration header, where the next reader will actually look.
- **Document resolution is in-repo markdown only.** `resolveRepoDocPath` rejects, before
  any filesystem call: any URL scheme, an absolute path, a path escaping the repo root
  via `..`, anything not ending in `.md`, and anything outside an allow-listed set of
  doc roots. Rejected: resolving external links (issue trackers, external docs) over
  HTTP, which would turn attacker-controlled PR-body text directly into outbound
  network calls with no equivalent guard.
- **A pasted plan counts as much as a linked one.** A reviewer meets a plan two ways: a
  link, or the whole document pasted into the PR body. Handling only the link would score
  the more informative of the two lower — the author who pastes the entire spec would get
  `medium`, the author who writes one line and links a file would get `high`.
  `detectInlinePlan` closes that by counting **distinct** ATX headings drawn from this
  repo's own two templates — `Goal`/`Scope`/`Out of scope`/`Design`/`Files touched`/
  `Verification` for a spec (`specs/README.md:15-36`), `Requirements`/`Architecture`/
  `Phased tasks`/`Lanes`/`Testing`/`Dependency` for a plan — with a threshold of three.
  Rejected: a length heuristic, which would promote any verbose description to `high`; and
  a threshold of two, which an ordinary PR template already reaches with `Goal` plus
  `Scope`. A detected body is capped at `MAX_INLINE_PLAN_CHARS` rather than the ordinary
  `MAX_BODY_CHARS`, because a single 4 000-character cap truncates a pasted plan
  mid-document — the derivation would read the Goal and lose Design and Out of scope,
  which are precisely the sections that make an intent authoritative about what is *not*
  in scope. A longer allowance is not more trust: the block is `wrapUntrusted`-wrapped
  either way. The same detector runs over each linked-issue body, since a plan pasted into
  the ticket rather than the PR is the same case.
- **`PrIntentRecord` is extended, not `Intent`.** The new `PrIntentDetail` contract
  extends `PrIntentRecord` (`review-api.ts:60`), which already carries `pr_id` and stays
  structurally assignable to `Intent` (`brief.ts:9`) so that a future `PrBrief` composer
  could consume it — feeding a reserved-but-unfed scaffold instead of orphaning it
  further. `Intent` itself is untouched: it is load-bearing for `PrBrief` (`brief.ts:117`)
  today and this feature has no reason to touch that path.
- **One vendored contract edited in place, a named exception.** `contracts/trace.ts`'s
  `PromptAssembly` gains `intent: z.string().nullish()` directly, contra the usual rule
  of adding a new file rather than editing an existing vendored contract. Justified
  because `PromptAssembly` is one flat object inside one `run_traces` jsonb document,
  addressed by the trace drawer *by field name* — there is no extension point a sibling
  file could hook into, and `repo_map`/`pr_description` were added to this same object
  the same way. `.nullish()`, not `.nullable()`, so an old persisted trace document with
  no `intent` key at all still parses. Blast radius: one additive, nullish key.
- **Synchronous route, not a background job.** Same rationale
  `02-conventions-extractor.md` already established for this codebase: `JobRunner` has a
  hard 120-second cap and there is no `GET /jobs/:id` status route. `DERIVE_TIMEOUT_MS`
  is set comfortably under that cap, and the single LLM call is wrapped in
  retry/timeout instead.
- **No new repository, no transaction typing.** `pr_intent` stays owned by
  `ReviewRepository` — a second repository class on one table is exactly what the
  existing single-owner rule prevents, and the write is a single `INSERT … ON CONFLICT
  DO UPDATE` on one row, so no `Db | Tx` union is introduced. Rejected: copying
  `ConventionsService`'s transaction typing, whose reason (an atomic multi-row replace)
  is absent here — it would be a pattern cargo-culted for a case this feature doesn't
  have.

## Files touched

**Shared contracts** (both vendor copies, `server/src/vendor/shared/` and
`client/src/vendor/shared/` — manual and byte-identical; no regeneration script exists,
despite `server/INSIGHTS.md:66` calling it "a regeneration step"):
- `contracts/intent.ts` (new) — `IntentConfidence`, `IntentSourceKind` (including
  `inline_plan`), `IntentSource`,
  `PrIntentDetail` extending `PrIntentRecord`.
- `contracts/trace.ts` — `PromptAssembly.intent: z.string().nullish()`, reconciling
  existing drift between the two copies rather than clobbering it.
- `index.ts` — barrel export of the new file, in both copies.

Server:
- `server/src/db/schema/reviews.ts` — `prIntent` widened with `confidence`, `sources`,
  `derived_from_sha`, `derived_at`, `provider`, `model`, `tokens_in`, `tokens_out`,
  `cost_usd`.
- `server/src/db/migrations/0013_*.sql` — the one migration; a hand-appended `CHECK`
  constraint on `confidence` (Drizzle's `text(…, { enum })` is types-only and emits no
  constraint).
- `server/src/modules/intent/routes.ts` (new) — `GET`/`POST /pulls/:id/intent`.
- `server/src/modules/intent/service.ts` (new) — the tenancy gate, `read`, `derive`,
  `deriveForRun`.
- `server/src/modules/intent/doc-loader.ts` (new) — reads candidate docs and the linked
  issue through the `GitClient`/`GitHubClient` ports, each call individually guarded.
- `server/src/modules/intent/helpers.ts` (new) — the pure, tested surface: `RawIntent`,
  `resolveRepoDocPath`, `extractDocLinks`, `extractClosingIssueNumber`,
  `detectInlinePlan`, `buildIndirectSignals`, `dropUngroundedScope`, `computeConfidence`,
  `isIntentFresh`, `toIntentDetail`.
- `server/src/modules/intent/constants.ts` (new) — schema name, timeouts, retries, caps,
  the doc-root allowlist.
- `server/src/prompts/intent.system.md` (new) — the derivation instruction text; no
  interpolation, no request for a confidence field.
- `server/src/modules/reviews/repository/pull.repo.ts` — `upsertIntent`/`getIntent`
  widened; new `getIntentRow` returning the raw row.
- `server/src/modules/reviews/run-executor.ts` — one best-effort derive step inserted
  before the per-agent loop.
- `server/src/modules/index.ts` — one import, one registry entry.
- `server/test/intent-helpers.test.ts`, `intent-docs.test.ts` (unit),
  `intent.it.test.ts` (integration, Docker-backed).

`reviewer-core/`:
- `src/prompt.ts` — `PromptParts.intent?: string`; the `## Intent` section, wrapped
  untrusted, between `## PR description` and `## Skills / rules`; `assembly.intent`;
  `MAX_INTENT_SECTION_CHARS`.
- `src/review/run.ts` — `ReviewInput.intent?: string`, threaded into `promptParts` on
  both the whole-diff and the map-reduce path.
- `test/prompt.test.ts`, `test/run.test.ts` — extended.

Client:
- `src/lib/hooks/intent.ts` (new) — `useIntent`, `useDeriveIntent`, both through `@/lib/api`.
- `src/lib/hooks/index.ts` — re-export.
- `src/lib/types.ts` — re-export of the new contract types.
- `.../pulls/[number]/_components/IntentCard/{IntentCard.tsx,styles.ts,index.ts,IntentCard.test.tsx}`
  (new) — the card; colocated, single consumer.
- `.../pulls/[number]/_components/OverviewTab` — mounts the card above Description.
- `.../pulls/[number]/page.tsx` — passes the already-resolved `prId` through.
- `messages/en/intent.json` (new) — its own namespace, not borrowed from `brief.json`'s
  reserved `block.intent` keys.
- `messages/en/runs.json` — one new key, `trace.prompt.intent`.
- `.../RunTraceDrawer/constants.ts` — `PROMPT_COLORS.intent`.
- `.../RunTraceDrawer/_components/TraceBody/TraceBody.tsx` — one conditional `PromptBlock`
  row, before the `skills` row so panel order matches assembly order.
- `TraceBody.test.tsx` — extended.

## Verification

- `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- `cd server && pnpm exec vitest run .it.test` (needs Docker)
- `cd server && pnpm db:generate && pnpm db:migrate`
- `cd reviewer-core && npm run typecheck && npm test`
- `cd client && pnpm typecheck && pnpm test`

Manual, end to end: `cd server && pnpm db:migrate && pnpm db:seed`, then `./scripts/dev.sh`.

1. Open a PR whose body links an in-repo plan. Click **Derive intent** — confirm the
   card shows the narrative, in/out-of-scope lists, a **high** confidence badge, the
   plan file in the source list, and a `derived_at` timestamp with a short sha.
2. Open a PR with **no link** but a whole spec pasted into the body (`## Goal`, `## Scope`,
   `## Out of scope`, `## Design`, …) — confirm **high** confidence with `inline_plan` in
   the source list, and that the derived out-of-scope list reflects the pasted
   `## Out of scope` section, which proves the body was not truncated at 4 000 characters.
3. Open a PR whose body is an untouched template (HTML comments, empty checkboxes) —
   confirm **low** confidence and a source list naming only title/branch/commits.
4. Run a review on the PR from step 1. Open its run trace's **Prompt assembly** panel —
   confirm a distinct **Intent** row; expand it and confirm the
   `<untrusted source="intent">` wrapper; expand **User / diff** and confirm `## Intent`
   sits between `## PR description` and `## Skills / rules`.
5. Run all agents on one PR — confirm the Live Log shows `intent: deriving…` exactly
   once, fanned into every agent's stream; run the same PR again and confirm the second
   run reuses the cache with no derive line.
6. In Settings → Feature Models, switch **PR Review · Intent** to a different model,
   then re-derive — confirm the card's model and cost change while the runs' own cost
   figures do not.
7. Force-push to the PR — confirm the card reports **stale** and a subsequent review
   re-derives. Then edit the description without moving the head — confirm it re-derives
   again.
8. Point `review_intent` at a model with no structured-output support, then run a review
   — confirm the review still completes with findings, the Live Log carries
   `intent: derivation failed — continuing without the Intent section` as an **info**
   (not error) line, and the prompt has no `## Intent` section.
