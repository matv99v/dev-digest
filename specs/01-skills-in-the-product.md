# 01 — Skills in the product

## Goal

A user can define a reusable review instruction ("skill") once, edit and version it in
the UI, and attach it — in a chosen order, enabled or disabled — to any number of
agents. An agent's enabled linked skills are injected into its review prompt as their
own block, so the same rule (e.g. "flag uncovered branches") no longer has to be
copy-pasted into every agent's system prompt.

## Scope

- Server CRUD for skills (create/read/update/delete, version history, restore, usage +
  finding stats, import preview from a `.md`/`.zip` upload).
- Feeding an agent's enabled, ordered, linked skills into the existing `skills` prompt
  slot in `reviewer-core`.
- Client: a `/skills` list + detail page (Config / Preview / Evals / Stats / Versions),
  an import drawer, and a `Skills` tab in the agent editor (attach/detach/reorder).
- A seeded skill catalogue, a new `Test Quality Reviewer` agent, and the agent↔skill
  links needed to run the control experiments end to end.

## Out of scope

- The eval pipeline (L06) — the Evals tab is a mount-point placeholder.
- `Import from URL` and the `Community` catalogue tabs (i18n exists; the drawer ships
  the file tab only).
- Per-link enable/disable — the agent tab's checkbox *is* attach/detach; `enabled` is a
  property of the skill itself.
- The Conventions extractor (the other half of L02).
- Any change to `reviewer-core` — its `skills` prompt slot already existed, unfed.

## Design

The DB tables (`skills`, `skill_versions`, `agent_skills`), the `Skill`/`SkillType`/
`SkillSource`/`AgentSkillLink` contracts, the agent-side link repository/service/routes,
and the `## Skills / rules` prompt slot in `reviewer-core/src/prompt.ts` all predate this
spec — they shipped in the starter, unused, per the project's "declare every table,
don't build unused ones out speculatively" convention. This feature's job is almost
entirely to *feed* that existing plumbing, not to build new plumbing:

- **Prompt placement.** Skills stay in the **user** message under `## Skills / rules`
  (`reviewer-core/src/prompt.ts:109`) rather than being moved into the system message —
  this needs zero engine changes and keeps every existing prompt test green.
- **Trust by source.** A skill the workspace owner wrote (`source: manual` or
  `extracted`) is injected raw. A skill that came from outside the workspace
  (`imported_url` or `community`) is delimiter-wrapped
  (`<untrusted source="skill:name">…</untrusted>`) the same way the diff and PR
  description are, so the shared `INJECTION_GUARD` treats it as data, never as
  instructions — see `docs/agent-prompts/README.md`. Imported skills also land
  `enabled: false` until a human vets them.
- **Stats are limited to what the data honestly supports.** `used_by_count`,
  `accept_rate` (attributed via the agent — a finding is credited to every skill linked
  to the agent that produced it, which the UI must label, not hide), `findings_last_30d`,
  and `findings_by_category`. A `PULL FREQUENCY` metric from an earlier design pass was
  dropped: an enabled linked skill is injected on every run of its agent, so it would
  always read 100%.
- **New agents.** Only `Test Quality Reviewer` is added. The API-contract control
  experiment runs on the existing `General Reviewer` with an `api-contract-guard` skill
  attached, rather than adding a second new agent.
- **Reference implementation.** A working version of this feature exists in a parallel
  checkout (`../orig-dev-digest`, branch `lesson-2-lab/skills`) and was adapted, not
  copied — see that repo's `INSIGHTS.md` for the rule. Kept: the route list and the
  `/skills/import`-before-`/skills/:id` registration order, the body-change-bumps-version
  rule, `SKILL.md`-first zip resolution, first-`#`-heading name fallback. Changed:
  import parsing moved into a pure, unit-testable `helpers.ts` function instead of living
  in the service; wrapping is by skill `source` instead of every body being injected
  unwrapped; `list()` is sorted by name so the left rail doesn't reorder between loads;
  `/skills/import` gets its own `bodyLimit` so a legitimate 5&nbsp;MB archive doesn't hit
  the server's global 1&nbsp;MB body cap after base64 inflation; an `accept_rate` stat was
  added.

## Files touched

Server (done):
- `server/src/db/schema/skills.ts` — added `skill_versions.message` (a per-version note).
- `server/src/db/migrations/0011_next_darkstar.sql` — the one migration this feature needs.
- `server/src/db/rows.ts` — `SkillRow`, `SkillVersionRow`.
- `server/src/vendor/shared/contracts/skills.ts` (new, mirrored into
  `client/src/vendor/shared/contracts/skills.ts`) — `SkillVersion`, `SkillStats`,
  `SkillImportPreview`. `Skill`/`SkillType`/`SkillSource`/`AgentSkillLink` were already in
  `contracts/knowledge.ts`.
- `server/src/modules/skills/{routes,service,repository,helpers,constants}.ts` (new) —
  the CRUD module, mirroring `modules/agents/`'s shape and conventions.
- `server/src/modules/index.ts` — registers the `skills` module.
- `server/src/platform/container.ts` — `container.skillsRepo`.
- `server/src/modules/reviews/helpers.ts` — `toSkillPromptBlocks()` (order + enabled
  filter + source-based wrapping).
- `server/src/modules/reviews/run-executor.ts` — resolves the agent's linked skills and
  passes them into `reviewPullRequest({ skills })`.
- `server/src/db/seed-prompts.ts` — `TEST_QUALITY_REVIEWER_PROMPT`.
- `server/src/db/seed-skills.ts` (new) — the seeded skill catalogue.
- `server/src/db/seed.ts` — seeds `Test Quality Reviewer` and the skill↔agent links.

Server (done):
- `server/test/skills-helpers.test.ts`, `server/test/prompt-skills.test.ts` (unit).
- `server/test/skills.it.test.ts` (integration, Docker-backed).

Client (done):
- `client/src/lib/hooks/skills.ts` — the React Query hooks (mirrors `hooks/agents.ts`).
- `client/src/components/app-shell/nav.ts` (new) + a `nav?: NavGroup[]` addition to
  `@devdigest/ui`'s `ShellContext`/`Sidebar` — the `SKILLS LAB` sidebar section.
- `client/src/app/skills/**` (new) — the list + detail page and its Config / Preview /
  Evals / Stats / Versions tabs, the body editor, and the import drawer.
- `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/` (new) —
  attach/detach/reorder, wired into `AgentEditor.tsx` and `page.tsx`'s `VALID_TABS`.
- `client/src/app/agents/_components/AgentCard/AgentCard.tsx` — resolves a real
  `skillCount` via `useAgentSkillLinks` when the caller doesn't already supply one.
- `client/src/app/repos/.../RunTraceDrawer/_components/PromptBlock/PromptBlock.tsx` —
  a `~N tokens` count per prompt block.
- `client/messages/en/skills.json` (extend), `client/messages/en/agents.json` (fix the
  stale "appended to the system message" copy).
- Client tests: `AgentCard.test.tsx`, `SkillsTab.test.tsx` + `helpers.test.ts`,
  `AgentEditor.test.tsx` — all passing (59/59 in the full client suite).

Also done: `e2e/flows/08-skills.flow.json`, `docs/agent-prompts/README.md` (trust-by-source
note), `docs/agent-prompts/test-quality-reviewer.md`, root `README.md`.

## Verification

- `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- `cd server && pnpm exec vitest run .it.test` (needs Docker)
- `cd client && pnpm typecheck && pnpm test`
- `cd reviewer-core && npm test` — must stay green; this feature never touches the package
- `./scripts/e2e.sh` (runs `e2e/flows/08-skills.flow.json` among the rest)
- Manual, end to end: `cd server && pnpm db:migrate && pnpm db:seed`, then `./scripts/dev.sh`.
  Create/edit a skill in the UI; import a `.zip` with a `SKILL.md` and confirm the preview
  lists the other archive entries as ignored and nothing is persisted before Save; attach
  skills to `Test Quality Reviewer` in a chosen order; run a review and open the run
  trace's Prompt assembly — confirm a `Skills` block appears with a token count, in the
  attached order, that a disabled skill drops out of the block, and that an imported
  skill's body is wrapped in `<untrusted source="skill:…">` while a manual skill's is not;
  run the Test Quality and API Contract control experiments with and without their
  skills attached and confirm the finding only appears with the skill attached.
