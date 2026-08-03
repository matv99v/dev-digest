# Skills

## Context

Today an agent is `provider + model + system_prompt`. Every review rule has to
be written directly into one agent's system prompt, so a rule like "don't mock
the unit under test" can't be reused across agents, and changing the rule means
editing several prompts by hand.

A **skill** is a named, reusable block of markdown instructions that can be
attached to many agents. A skill is **text only** — no tools, no scripts, no
executable code. At review time, the bodies of a skill's enabled links are
inserted into the `## Skills / rules` section of the prompt, in the order the
user set on each agent.

Outcome: a rule is edited in one place, can be toggled globally or per-agent,
shows up as its own labelled block (with a token count) in the run trace, and
a controlled before/after experiment can demonstrate that a skill changes what
an agent flags.

## What already existed before this feature

Half the backend for this was already in the repository — this feature is
largely about wiring up what was sitting unused, not designing from scratch.

| Already there | Where |
|---|---|
| `skills`, `skill_versions`, `agent_skills` tables | `server/src/db/schema/skills.ts`, `agents.ts:51` |
| `Skill`, `SkillType`, `SkillSource`, `AgentSkillLink` contracts | `server/src/vendor/shared/contracts/knowledge.ts` |
| Link/reorder/unlink skills on an agent | `AgentsRepository.linkedSkills/linkSkill/setSkills` — `server/src/modules/agents/repository.ts` |
| `GET`/`POST /agents/:id/skills` routes | `server/src/modules/agents/routes.ts` |
| Rendering of the `## Skills / rules` prompt block | `reviewer-core/src/prompt.ts` |
| `skills?: string[]` on the engine's review input | `reviewer-core/src/review/run.ts` |
| `prompt_assembly.skills` slot on the run trace | `contracts/trace.ts` |
| Skills block already rendered in the Run Trace UI | `RunTraceDrawer/.../TraceBody.tsx` |
| The "280px list + tabbed detail" layout, reused 1:1 | `client/src/app/agents/[id]/page.tsx` |
| Full `skills` i18n namespace (list page, drawer, preview, list item) | `client/messages/en/skills.json` |
| `activeKeyFor` already maps `/skills` | `client/src/components/app-shell/helpers.ts` |
| `AgentCard` already accepts a `skillCount` prop | `client/src/app/agents/_components/AgentCard/AgentCard.tsx` |
| `editor.tabs.skills` already in agent i18n | `client/messages/en/agents.json` |

The gap was exactly four things: no `skills` CRUD module, `run-executor`
didn't resolve skills into the prompt, no UI, no import.

## Decisions

1. **One new agent** — Test Quality Reviewer. An "API Contract Reviewer" was
   discussed but is out of scope.
2. **Import: markdown only.** No archives, no import-by-URL, no community
   catalog. The feature adds zero new dependencies.
3. **Two levels of "enabled"**: a global `skills.enabled` (toggle on the
   card) and a per-link `agent_skills.enabled` (checkbox in the agent's
   Skills tab). A skill reaches the prompt only when **both** are on.
4. **Version history is kept**: changing `body` bumps `skills.version` and
   writes an immutable snapshot to `skill_versions`, mirroring how
   `agent_versions` works for agents.
5. **No Evals tab.** The eval pipeline is a later lesson; the skill detail
   view ships `Config · Preview · Stats · Versions`, no "Run on evals".
6. **Stats show only what the database actually has.** `findings` carries no
   foreign key to `skills`, so pull-frequency, accept-rate, and
   findings-by-category are not fabricated — the Stats tab says as much
   instead of showing invented numbers.
7. **Versions is full-featured**: a message per version, a line `Diff`
   against the current body, and `Restore`.
8. **The body editor is a small home-grown gutter over a `<textarea>`** — line
   numbers, a filename chip, an "unsaved" badge, a token counter. No
   CodeMirror, no new dependency; the Preview tab stands in for syntax
   highlighting.

## Trust model

A skill is **instructions**, not data. It is deliberately **not** wrapped in
`wrapUntrusted`: if it were, the prompt's injection guard would tell the model
to ignore it, and the skill would stop working. So an untrusted skill is,
literally, someone else's instructions inside your agent's prompt.

The product's compensation: import only accepts markdown text (there is no
channel an executable could travel through), nothing is ever written to disk,
and an imported skill is saved `enabled: false` with a "needs vetting" badge
until a human reviews and enables it.

## Backend shape

- New `server/src/modules/skills/` module (routes → service → repository),
  mirroring the `agents` module's layering.
- `agent_skills.enabled` and `skill_versions.message` columns, added via
  Drizzle migration — never hand-edited.
- `run-executor.ts` resolves an agent's linked, doubly-enabled skills (in
  `order`) into `ReviewInput.skills`, logs one line per *enabled* skill (never
  for a disabled one), and records the block's token count on
  `prompt_assembly.skills_tokens`.
- `POST /agents/:id/skills` gains a third body shape,
  `{ skills: [{ skill_id, enabled }] }`, alongside the two that already
  existed, to save the per-link enabled flag together with order.

## Frontend shape

- `/skills` and `/skills/[id]` reuse the Agents editor's list+detail layout.
- Skill detail has four tabs: **Config** (form + the textarea-gutter body
  editor), **Preview** (rendered markdown, including unsaved edits),
  **Stats** (usage counts from the DB, explicitly not findings/accept-rate),
  **Versions** (history, diff, restore).
- The Agent editor gains a **Skills** tab: attach/detach, reorder
  (drag + up/down buttons), and toggle each link's `enabled`.
- Import is a drawer: pick/drop a `.md` file, preview the parsed
  name/description/body, save (always `enabled: false`) — nothing is
  persisted before that explicit save.

## New agent and its skills

**Test Quality Reviewer** — checks test *quality* in a diff: uncovered
branches, missed corner cases, mock overuse, flaky-test smells. Prompt lives
in `docs/agent-prompts/test-quality-reviewer.md` (human-readable original) and
`TEST_QUALITY_REVIEWER_PROMPT` in `server/src/db/seed-prompts.ts` (seeded
copy), following the same two-places convention as the three built-in agents.

Four skills, three seeded and linked (`uncovered-branch-gate`,
`mock-overuse-gate`, `flaky-test-smells`), one (`corner-case-checklist`)
deliberately imported through the UI from a fixture so the whole import path
gets exercised.

## Controlled experiment

PR #483 is seeded with a diff that adds a function with an explicit branch
(e.g. `parseRetryAfter` handling a missing/zero/negative header) plus a test
that only exercises the happy path — fully seeded via `pr_files`, so it works
without a GitHub token or a clone.

1. Run Test Quality Reviewer with its skills unlinked/disabled → no branch
   finding.
2. Enable the skills, run again → flags the uncovered branch and the edge
   case.
3. Open the run trace → Prompt assembly → a dedicated **Skills** block with a
   token count; the live log shows one line per enabled skill.
