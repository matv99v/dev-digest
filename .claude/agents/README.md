# Agents

Subagent definitions for this repo. Each runs in its own context window and returns **only a
summary** to the caller — so an agent's output template is its whole contract, not a
formality. No official source defines a schema for that handoff; the templates here are local
convention.

This file is a map. The rules themselves live in each agent's own file; don't restate them
here, and don't expect this page to be the source of truth for behaviour.

## Catalog

| Agent | Model | Preload | Does | Never does |
|---|---|---|---|---|
| [brainstorm](brainstorm.md) | opus | 2 skills · ~4.7k | Generates and weighs 3–5 materially different approaches to one problem, and recommends one | writes any file, produces a task breakdown, returns a single option |
| [researcher](researcher.md) | sonnet | — | Finds facts in the project or on the internet, cited | edits anything, decides anything |
| [investigator](investigator.md) | sonnet | — | Traces structure in the current working tree — definitions, callers, reach, blast radius — inside a stated read budget | reads git history, leaves the tree, recommends or judges anything |
| [planner](planner.md) | opus | 11 skills · ~24k | Turns a request into an executable Development Plan | writes product code |
| [implementer](implementer.md) | sonnet | 12 skills · ~31k | Executes one lane of an approved plan, to green | plans, reviews, commits |
| [test-writer](test-writer.md) | sonnet | 3 skills · ~9.5k | Writes the tests for a change that already exists, and runs the package's suite | writes product code, chases coverage, or is run on a path a live lane owns while a plan is executing |
| [architecture-reviewer](architecture-reviewer.md) | opus | 2 skills · ~4.7k | Reviews a diff against this repo's architecture rules, with evidence | edits, computes a verdict, reports style |
| [plan-verifier](plan-verifier.md) | opus | — | Checks a plan's requirements and Acceptances against the code that was written | reviews anything the plan does not require |
| [doc-writer](doc-writer.md) | sonnet | 1 skill · ~1.8k | Documents what exists, on the surface the content belongs on | writes code, plans, or an INSIGHTS.md entry |
| [insight-curator](insight-curator.md) | sonnet | 1 skill · ~3.7k | Audits the five INSIGHTS.md files as a set and proposes dedupes, promotions and prunes | edits any file, proposes into specs/ or a skill, promotes on one occurrence |

`researcher` answers a question and may leave the tree to do it — history, upstream docs,
both; `investigator` answers a structural relation and may not leave the tree at all. When
you only need to locate something, the built-in `Explore` is cheaper than either.

Architecture review is now `architecture-reviewer`; plan conformance against a Development
Plan is `plan-verifier`. Security review still has no agent — `pr-self-review` remains the
only thing that blocks a push, and `implementer`'s `Left for review` section now has two
readers instead of none.

## The chain

```
request → brainstorm (optional — when the how is not settled; N options, one recommendation)
        → researcher   (optional, bounded lookups — project or internet, cited)
          investigator (optional, bounded structural trace of the current tree)
        → planner    → docs/plans/NN-<feature>.md
        → implementer × N lanes, in parallel
        → test-writer (optional — when tests are the deliverable, after the lanes)
        → architecture-reviewer  ┐ fresh context, read-only, no verdict
          plan-verifier          ┘
        → doc-writer (optional — when the change needs documenting)
        → orchestrator: records the lanes' Insights via /engineering-insights
        ⋯ insight-curator (periodic, not per change — audits the INSIGHTS.md set and proposes)
```

The `⋯` is not a step in a change's chain: `insight-curator` runs on the corpus, on its own
cadence, and it is the owner the `engineering-insights` skill's "Prune quarterly" line never
had.

The orchestrator is the main session. It reads the plan's `Lanes` section and starts one
`implementer` per lane, handing each its tasks, its **owned paths**, and the union of the
**other lanes' paths** — that last list is how a parallel implementer detects a collision
itself.

`researcher` and `investigator` are the back-edges in that chain. Besides their own steps
above, the four agents that produce an artefact may spawn either of them — or the built-in
`Explore` — mid-task, so a lane's alternative to a cited answer is not a guess. The next
section is the whole rule.

---

## Delegation — who may spawn whom

Four agents hold the `Agent` tool: `planner`, `implementer`, `test-writer`, `doc-writer` —
the four that produce an artefact and would otherwise have to guess. Each may spawn exactly
three, and each body carries the same routing table:

| The caller needs | It spawns |
|---|---|
| To locate a file or a symbol | the built-in `Explore` — the cheapest of the three |
| A structural relation in the tree as it stands | `investigator` |
| A fact from git history, or from upstream docs and specs | `researcher` |

**Everything else is the orchestrator's to start.** Not a house preference — each exclusion
is a rule the agent already carries. A reviewer (`architecture-reviewer`, `plan-verifier`)
spawned from inside a lane would review that lane's work in that lane's own context, which is
the single thing a fresh-context review exists to prevent. `brainstorm` runs *before*
`planner`, not under it, and takes `researcher`'s mode `B` as an input the orchestrator
supplies (see its Tools row). `insight-curator` runs on the corpus, on its own cadence.
An agent that writes never starts another agent that writes — that is how two agents come to
edit the same path.

The three callees are read-only by construction, which is what makes the widening safe: no
`Edit`, no `Write`, and a `Bash` allowlist in each body.

**Both paths are written down, because the tool is not verified.** `Agent` is listed among the
tools removed from subagents, annotated "(at depth limit)" — the same gap stated under
`brainstorm`'s Sources. So each caller's *Delegated lookup* section names a fallback: do the
work that does not depend on the answer, surface the question in a named section of its own
report (`### Research` · `Left for the caller` · `Could not verify` · `Risks & mitigations`,
marked **Needed:** and naming the agent that should run it), and let the orchestrator run it
and re-invoke. The capability lands whichever way the tool resolves; nothing silently degrades
into a guess.

---

## brainstorm

| | |
|---|---|
| **Responsibility** | Generate the approaches to one unsettled problem — three that differ in mechanism, up to five — cost each against this tree, rank them against criteria stated *before* the ranking, and end on one recommendation and the single fact that would overturn it. |
| **Tools** | `Read`, `Glob`, `Grep`, `Bash` — read-only, and no `Skill` tool. No `WebSearch`/`WebFetch`: what upstream offers is `researcher`'s mode B, run before this agent when an option depends on it. |
| **Model** | `opus` — generating three options is easy; deciding which one wins *here*, and naming the fact that would flip it, is the judgement the file lives or dies on. |
| **Preload** | 2 skills · ~4.7k: `onion-architecture` and `ui-architecture` — feasibility constraints a request never mentions, and usually the reason one option costs less than another. Everything else stays off: `fastify-best-practices` contradicts `onion-architecture` on repositories, so preloading both preloads a contradiction; the advice skills describe writing code this agent never writes; the rest matter only once an option is chosen. |
| **Input** | A problem whose *how* is not settled. It interviews on exactly three triggers — no problem at all, a solution named instead of an outcome, or a missing criterion that would change the winner — and otherwise states an assumption and proceeds, because a fuzzy problem is its normal input. |
| **Output** | `## Options`: the restated outcome, the criteria in priority order, one block per option (mechanism / touches / cost / risk / forecloses), a comparison table, exactly one `### Recommendation` with a runner-up and a flipping fact, a mandatory *Not explored*, a mandatory *Could not establish*. |

It writes nothing, and that is what keeps it off `planner`'s artefact: a plan has no
"alternatives rejected" section, and `## Not planned` is cut *scope* rather than weighed
*approaches*. A chosen option has two durable routes onward and this agent takes neither —
the caller pastes it into `planner`'s brief, or `doc-writer` records it as an ADR in `docs/`.
The orchestrator invokes it, not `planner`; see the `Agent` gap below.

**Sources**

- [Subagents](https://code.claude.com/docs/en/sub-agents) — the read-only example `tools:
  Read, Grep, Glob, Bash`, where "The subagent can't edit files, write files, or use any MCP
  tools"; "the subagent does that work in its own context and returns only the summary"; the
  model resolution order. `skills:` — "The full skill content is
  injected, not only the description. Subagents can still invoke unlisted project, user, and
  plugin skills through the Skill tool", which is exactly why `Skill` is dropped from `tools`. **Gap stated:** no sentence says `tools` restricts
  *paths*, so any path restriction is a prompt-level rule, the same caveat `planner.md`
  carries for its own `Write`.
  **Gap stated:** `Agent` is listed among the tools removed from subagents, annotated "(at
  depth limit)" — ambiguous as rendered and unverified at runtime, which is why this agent is
  invoked by the orchestrator rather than reached through `planner`.
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) —
  "Separate research and planning from implementation to avoid solving the wrong problem",
  and the interview pattern: "Ask about technical implementation, UI/UX, edge cases, concerns,
  and tradeoffs. Don't ask obvious questions, dig into the hard parts I might not have
  considered." **Gap stated:** `AskUserQuestion` is removed from all subagents, so a subagent
  cannot run that interview itself; the house substitute is the `# Interview first` block that
  returns the questions as its deliverable.
- [Run agents in parallel](https://code.claude.com/docs/en/agents) — "For independent
  investigations, spawn multiple subagents to work simultaneously", and a dynamic workflow as
  "A script that runs many subagents and cross-checks their results… or **a plan drafted from
  several angles**". **Gap stated:** neither page uses the term Best-of-N, and neither
  describes generating competing options inside one subagent — so N-options-per-run is local
  convention, and genuine Best-of-N is the orchestrator running several instances in parallel.
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
  — "Each subagent needs an objective, an output format, guidance on the tools and sources to
  use, and clear task boundaries."

---

## researcher

| | |
|---|---|
| **Responsibility** | Establish what is true — in this project's files and history, or in upstream documentation. Every claim carries a locator and a verbatim excerpt. |
| **Tools** | `Read`, `Grep`, `Glob`, `Bash`, `WebSearch`, `WebFetch` — read-only by construction; the body further narrows `Bash` to history and file reads |
| **Model** | `sonnet` |
| **Input** | A specific question. No question, or an unusable one, and it returns clarifications instead of guessing. |
| **Output** | A cited report, plus a mandatory *Not found / gaps* section. |
| **Callers** | The orchestrator, and `planner`, `implementer`, `test-writer`, `doc-writer` mid-task — see *Delegation — who may spawn whom* above. |

**Sources**

- [Subagents](https://code.claude.com/docs/en/sub-agents) — the read-only pattern (`tools:
  Read, Grep, Glob, Bash`), and the summary-only return that makes the cited report the
  contract.
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — use a
  subagent so a long exploration does not consume the main context, and scope the
  investigation narrowly rather than reading the tree.

---

## investigator

| | |
|---|---|
| **Responsibility** | Trace structure in the working tree as it stands — where a symbol is defined, who calls it, what a file reaches, what would change with it — and return the edges, each carrying the verbatim import or call line that justifies it. |
| **Tools** | `Read`, `Grep`, `Glob`, `Bash` — read-only, no `Skill` tool, and deliberately no `WebSearch`/`WebFetch`. Its `Bash` allowlist excludes `git log`, `git blame`, `git show` and `git diff`: history is routed to `researcher` by name, not narrowed into scope. |
| **Model** | `sonnet` — it executes a bounded search against an explicit target; the anti-scope forbids the only judgement it could otherwise make. |
| **Input** | A named starting point — path, symbol, route, table, message key or error string — and one of four question shapes (`where defined`, `who calls it`, `what it reaches`, `blast radius`). No starting point, it stops in one line; no question shape, it defaults to `blast radius` and says so. It never asks a question with a default. |
| **Output** | `## Trace`: a `**Budget:**` line reporting reads and hops used against the caps, a numbered chain whose every hop carries a locator and its connecting line, the named boundary the chain stopped at, a blast-radius list, a mandatory *Frontier*, a mandatory *Not established*. |
| **Callers** | The orchestrator, and `planner`, `implementer`, `test-writer`, `doc-writer` mid-task — see *Delegation — who may spawn whom* above. It is the cheapest agent in the roster, which is what makes it the right callee for "what would this change drag with it". |

**No `skills:` key and no `Skill` tool — deliberate, not an omission.** Its subject is the
import graph and the lines it reads; every criterion comes from the caller's target.
Preloading an architecture skill would turn a trace into a review, which is
`architecture-reviewer`'s job and the first entry in this one's anti-scope. `Skill` is dropped
from `tools` because that is the one part of the restriction a tool allowlist can enforce
rather than request in prose. Preload: `—`, 0 tokens — the cheapest agent in the roster, which
is the point.

**The boundary with `researcher`, which already calls itself "a read-only investigator":**
`researcher` answers a question and may leave the tree to do it; this agent answers a
structural relation and may not leave the tree at all. Four narrowings make that enforceable
rather than promised — no internet tools on the `tools` line, history commands under
*Forbidden*, an input contract instead of an interview gate, and a read budget written as two
numbers (25 files, 6 hops) and reported on every run. The artefact differs too: a cited
finding list versus a re-walkable graph.

**Sources**

- [Subagents](https://code.claude.com/docs/en/sub-agents) — the read-only example `tools:
  Read, Grep, Glob, Bash`, where "The subagent can't edit files, write files, or use any MCP
  tools"; "the subagent does that work in its own context and returns only the summary"; the
  model resolution order. **Gap stated:** no sentence says `tools` restricts
  *paths*, so any path restriction is a prompt-level rule, the same caveat `planner.md`
  carries for its own `Write`.
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — **the
  infinite exploration**: "You ask Claude to 'investigate' something without scoping it.
  Claude reads hundreds of files, filling the context. > **Fix**: Scope investigations
  narrowly or use subagents so the exploration doesn't consume your main context" — the
  sentence this agent's budget turns into two numbers. Also "Give Claude a check it can run…
  Have Claude show evidence rather than asserting success".
- [Run agents in parallel](https://code.claude.com/docs/en/agents) — the built-in `Explore`:
  "A fast, read-only agent optimized for searching and analyzing codebases… file discovery,
  code search, codebase exploration", with Write and Edit denied, and it "skips `CLAUDE.md`
  files and git status to keep research fast and inexpensive" — the neighbour this agent must
  not duplicate, and the reason its own value has to be the checkable trace rather than the
  search. **Gap stated:** no official source addresses two subagent descriptions matching the
  same request; the only quantified limit is the 15,000-token combined-description budget,
  past which Claude Code warns at startup and still loads every subagent.
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
  — "Each subagent needs an objective, an output format, guidance on the tools and sources to
  use, and clear task boundaries."

---

## planner

| | |
|---|---|
| **Responsibility** | Decide what will be built, where it goes, in what order, and how it will be proved — then write that to a file an implementer can execute without re-deciding anything. |
| **Tools** | `Read`, `Glob`, `Grep`, `Bash`, `Agent`, `Write`, `Skill`. `Write` is meant for `docs/plans/` only — an agent body cannot restrict a path, so this is a prompt-level rule (`planner.md`), not a technically enforced one. `Agent` delegates a bounded lookup to `Explore`, `investigator` or `researcher`, per the routing table above. |
| **Model** | `opus` — the judgement-heavy half of the work |
| **Preload** | 11 skills, backend **and** frontend, because it plans both. Excludes `react-testing-library` (how to write a test, not which behaviour needs one) and `engineering-insights` (it records nothing). |
| **Input** | A feature, change, or bug fix. |
| **Output** | `docs/plans/NN-<feature>.md`; returns the path plus a summary. Clarifying questions when the request is vague; a *Cannot plan* note when it is unplannable even after answers. |

Load-bearing parts of a plan: requirements with ids, tasks carrying `Type` and owned paths,
an acyclic dependency DAG, lanes with disjoint paths, a real verification command per module.
A `Red-flags check` gates all of it before the file is emitted.

**Sources**

- [Subagents](https://code.claude.com/docs/en/sub-agents) — a subagent returns only a summary,
  which is why the plan is written to a file rather than returned as text; `tools` as an
  allowlist; `description` as the sole delegation signal.
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — the
  explore → plan → implement separation itself, and scoping investigations narrowly against
  "the infinite exploration".
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
  — a subagent needs an objective, an output format, tool guidance and clear boundaries: the
  four fields every task carries. Vague task descriptions make agents duplicate work, hence
  disjoint owned paths; agent count scales to complexity rather than being fixed.
- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
  — third-person description naming what + when; add only what the model doesn't already know.

---

## implementer

| | |
|---|---|
| **Responsibility** | Take one lane to green — write the code and prove the module's existing tests still pass. |
| **Tools** | `Read`, `Glob`, `Grep`, `Edit`, `Write`, `Bash`, `Agent`, `Skill`. `Agent` spawns `Explore`, `investigator` or `researcher` and nothing else — an answer it cannot read for itself, never a decision the plan should have made. |
| **Model** | `sonnet` — it executes a specification rather than designing one |
| **Preload** | 12 skills, the full backend + frontend set. `Type` on each task selects which to lean on; it is emphasis, never a load instruction. |
| **Input** | The plan, this lane's tasks, its owned paths, and the other lanes' owned paths. Missing any of those, it stops rather than guessing. |
| **Output** | An Implementation Report: changes, skills applied, acceptance per task, verification with **real command output**, and three mandatory sections — deviations, insights, what it left for review. |

It does not write to any `INSIGHTS.md`. Those files are shared and belong to no lane, so
findings go into the report and the orchestrator appends once, after every lane is done.

**Sources**

- [Subagents](https://code.claude.com/docs/en/sub-agents) — `skills:` injects full skill
  content at startup while a `Skill` call is a decision the model can silently skip, which is
  why a mandatory set is preloaded; `tools` as a least-privilege allowlist, which matters
  because these run unattended and in parallel.
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — give the
  agent a check it can run and have it show the command's output rather than assert success;
  stop after two failed corrections; review belongs in a fresh context and should report gaps,
  not style preferences.
- [Skills](https://code.claude.com/docs/en/skills) — progressive disclosure, and the caution
  that a skill can grant itself broad tool access: `drizzle-orm-patterns` carries
  `allowed-tools: Read, Write, Edit, Bash, Grep, Glob`.
- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
  — degrees of freedom: low where it is fragile (skill precedence, verify commands), high
  elsewhere; the body explains no React, Fastify or TypeScript the model already knows.

---

## test-writer

| | |
|---|---|
| **Responsibility** | Write and extend tests for code someone else already wrote — one test per behaviour that would catch a regression this project cares about, then prove the suite is green. |
| **Tools** | `Read`, `Glob`, `Grep`, `Edit`, `Write`, `Bash`, `Agent`, `Skill`. `Agent` spawns `Explore`, `investigator` or `researcher` and nothing else — what a testing tool does at the pinned version, or who else calls the unit being pinned, never which behaviour to pin. |
| **Model** | `sonnet` — it pins a behaviour someone else settled; *which* case to pin is bounded by `TESTING.md`'s typology, a rule to apply rather than a design to invent. |
| **Preload** | 3 skills · ~9.5k: `react-testing-library` (how a test body is written), `onion-architecture` (the testing seam — `buildApp({ config, db, overrides })`, a fake from `src/adapters/mocks.ts`, the `*.it.test.ts` convention), `ui-architecture` (where a client test file belongs). `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design` and `zod` stay on demand via `Skill`, for when a task actually needs one. |
| **Input** | The code under test, the behaviour that must hold, which package(s), and whether Docker-backed integration tests are in scope — all four, or it stops. |
| **Output** | `## Test Report`: files touched; one line per test naming the behaviour it pins, not the function it calls; the suite command with real output; a mandatory *Deliberately not tested* and *Left for the caller*. |

`implementer` writes a test when a task's Acceptance names one, inside its lane's owned paths,
as part of taking that lane to green. `test-writer` is for when tests *are* the deliverable —
code already written, a plan that asked for none, or a behaviour someone wants pinned — and
while a plan is executing, it is never run on a path a live lane owns.

**Sources**

- [Subagents](https://code.claude.com/docs/en/sub-agents) — `tools` is an allowlist and
  `disallowedTools` a denylist ("If both are set, `disallowedTools` is applied first, then
  `tools` is resolved against the remaining pool"); "the subagent does that work in its own
  context and returns only the summary"; `skills:` — "The full content of each listed skill is
  injected into the subagent's context at startup… not which skills the subagent can access";
  the model resolution order (per-invocation → frontmatter → `CLAUDE_CODE_SUBAGENT_MODEL` →
  main). **Gap stated:** the docs contain no sentence saying `tools` cannot restrict *paths*,
  so the path restriction above is a prompt-level rule, the same caveat `planner.md` already
  carries for its own `Write`.
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — "Give
  Claude a check it can run… Have Claude show evidence rather than asserting success"; the
  trust-then-verify gap: "Claude produces a plausible-looking implementation that doesn't
  handle edge cases. > Fix: Always provide verification… If you can't verify it, don't ship it."
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
  — "Each subagent needs an objective, an output format, guidance on the tools and sources to
  use, and clear task boundaries."
- [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles/) —
  "The more your tests resemble the way your software is used, the more confidence they can
  give you."
- [Query priority](https://testing-library.com/docs/queries/about/) — `getByRole` →
  `getByLabelText` → `getByPlaceholderText` → `getByText` → `getByDisplayValue` →
  `getByAltText` → `getByTitle` → `getByTestId` last resort; on `querySelector`, "using this as
  an escape hatch to query by class or id is not recommended because they are invisible to the
  user."
- [user-event](https://testing-library.com/docs/user-event/intro/) — "fireEvent dispatches DOM
  events, whereas user-event simulates full interactions."
- [Testing Implementation Details](https://kentcdodds.com/blog/testing-implementation-details)
  — the case against asserting on internals rather than rendered output or a returned value.
- [Test Coverage](https://martinfowler.com/bliki/TestCoverage.html) — "high coverage numbers
  are too easy to reach with low quality testing," the same stance `TESTING.md` takes.
- [Non-determinism in tests](https://martinfowler.com/articles/nonDeterminism.html) —
  transaction-rollback isolation, rebuilding the fixture per test, wrapping the clock.
- [Vitest — improving performance](https://vitest.dev/guide/improving-performance.html) — "By
  default Vitest runs every test file in an isolated environment based on the pool."

---

## architecture-reviewer

| | |
|---|---|
| **Responsibility** | Review a diff, branch or named file list against this project's architecture rules, in a fresh read-only context, and report findings that carry a locator, the rule, the concrete failure, and a severity. |
| **Tools** | `Read`, `Grep`, `Glob`, `Bash` — read-only, no `Edit`/`Write`/`NotebookEdit`. |
| **Model** | `opus` — deciding an arrow points the wrong way is easy; deciding whether it matters here is the hard part, and the false-positive gate is the single most failure-prone instruction in the file. |
| **Preload** | 2 skills · ~4.7k: `onion-architecture` (layering and dependency direction, and its review checklist) and `ui-architecture` (client file placement and data flow). `security` is deliberately excluded — that review is a separate pass this repo does not yet have an agent for. |
| **Input** | A diff scope — a diff, a base to compute one from, or an explicit file list. Missing it, stop. What the change was supposed to do, one line — missing it, proceed and say every requirement-match judgement was unavailable. |
| **Output** | `## Architecture Review`: a verdict of Clean or Findings by severity; the finding blocks that survived the false-positive gate; *Not reviewed*; a mandatory *Could not verify*. |

It does not run `dependency-cruiser` — the command is outside its allowlist — so it reasons
from the imports it reads and never claims a mechanical result it did not produce.
`pr-self-review` may spawn it as the reviewer for one of its buckets; the reverse never
happens, and this agent computes no verdict of its own.

**Sources**

- [Subagents](https://code.claude.com/docs/en/sub-agents) — the read-only example `tools:
  Read, Grep, Glob, Bash` with "The subagent can't edit files, write files, or use any MCP
  tools"; `skills:` — "The full content of each listed skill is injected into the subagent's
  context at startup… not which skills the subagent can access"; the model resolution order.
  **Gap stated:** no sentence says `tools` restricts *paths*, so any path restriction is a
  prompt-level rule, the same caveat `planner.md` carries for its own `Write`.
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — "Give
  Claude a check it can run… Have Claude show evidence rather than asserting success"; "A
  reviewer running in a fresh subagent context sees only the diff and the criteria you give
  it, not the reasoning that produced the change"; the false-positive control: "A reviewer
  prompted to find gaps will usually report some, even when the work is sound… Tell the
  reviewer to flag only gaps that affect correctness or the stated requirements, and treat the
  rest as optional."
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
  — "Each subagent needs an objective, an output format, guidance on the tools and sources to
  use, and clear task boundaries."
- [Google eng-practices — the standard](https://google.github.io/eng-practices/review/reviewer/standard.html)
  — "There is no such thing as 'perfect' code"; the `Nit:` convention.
- [Google eng-practices — what to look for](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
  — "Don't block CLs from being submitted based only on personal style preferences."
- [C4 model — diagrams](https://c4model.com/diagrams) — the Context/Container/Component/Code
  vocabulary for stating at which level a finding sits.
- [ArchUnit](https://www.archunit.org/) — deterministic dependency rules, the model the
  `onion-architecture` dependency-cruiser gate follows.
- [Fitness function-driven development](https://www.thoughtworks.com/en-us/insights/articles/fitness-function-driven-development)
  — **medium confidence, paraphrased**: encoding architectural rules as automatable checks
  rather than review-time judgement calls.

---

## plan-verifier

| | |
|---|---|
| **Responsibility** | Check one Development Plan against the code actually written — every requirement traced forward to evidence it read or a command it ran, every changed file traced backward to the task that asked for it. |
| **Tools** | `Read`, `Grep`, `Glob`, `Bash` — read-only, and no `Skill` tool. |
| **Model** | `opus` — refusing an out-of-scope observation is harder than making one, and "partial" is a judgement call; it should not be weaker than the agent it grades. |
| **Input** | The plan's path under `docs/plans/`, and the diff or base commit to check it against. Missing either, it stops rather than reviewing the code generically. |
| **Output** | `## Plan Verification`: a verdict of `CONFORMS \| GAPS \| CANNOT VERIFY`; a requirement matrix with no requirement id absent; per-task Acceptance lines quoting the plan verbatim; *Unasked-for changes*; a *Verification run* with real command output; a mandatory *Cannot verify*. |

**No `skills:` key and no `Skill` tool — deliberate, not an omission.** Its subject is a
document and a diff; every criterion it applies comes from the plan being checked, and
preloading an architecture skill would hand it a second, competing set of criteria. `Skill`
is dropped from `tools` for the same reason, and because it is the one part of this
restriction a tool allowlist can actually enforce rather than merely request in prose. It
computes no architecture judgement of its own, and it does not accept an implementer's own
report as evidence — only a `file:line` it read or a command it ran itself.

**Sources**

- [Subagents](https://code.claude.com/docs/en/sub-agents) — the read-only example `tools:
  Read, Grep, Glob, Bash`; "the subagent does that work in its own context and returns only
  the summary"; the model resolution order. **Gap stated:** no sentence says `tools` restricts
  *paths*, so any path restriction is a prompt-level rule, the same caveat `planner.md`
  carries for its own `Write`.
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — "Give
  Claude a check it can run… Have Claude show evidence rather than asserting success"; "A
  reviewer running in a fresh subagent context sees only the diff and the criteria you give
  it, not the reasoning that produced the change"; the false-positive control: "A reviewer
  prompted to find gaps will usually report some, even when the work is sound… Tell the
  reviewer to flag only gaps that affect correctness or the stated requirements, and treat the
  rest as optional."
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
  — "Each subagent needs an objective, an output format, guidance on the tools and sources to
  use, and clear task boundaries."
- [NASA SWE-067 — Verify Implementation](https://swehb.nasa.gov/spaces/7150/pages/16450546/SWE-067+-+Verify+Implementation)
  — verification of implementation is "confirming that the implementation (code) correctly,
  completely, consistently, and accurately includes each software requirement" — this agent's
  scope fence.
- [NASA SWE-072 — Bidirectional Traceability](https://swehb.nasa.gov/display/7150/SWE-072+-+Bidirectional+Traceability+Between+Software+Test+Procedures+and+Software+Requirements)
  — "empty cells in the matrix" flag an untested requirement or a test with no requirement,
  which is what the backward trace catches.
- [Gherkin reference](https://cucumber.io/docs/gherkin/reference/) — "While it might be
  tempting to implement Then steps to look in the database - resist that temptation!"
- [Reward hacking in reasoning models](https://alignment.anthropic.com/2026/reward-seeker/) —
  why the implementer must not grade itself: a model that "learned to cheat rather than
  completing tasks as intended."

---

## doc-writer

| | |
|---|---|
| **Responsibility** | Document functionality that already exists, or turn a settled plan, spec or report into documentation — deciding the surface before writing, and drawing a Mermaid diagram when a relationship rather than a procedure needs explaining. |
| **Tools** | `Read`, `Glob`, `Grep`, `Edit`, `Write`, `Bash`, `Agent`, `Skill`. It has no `WebSearch`, so `Agent` → `researcher` mode `B` is its only sanctioned route to an upstream fact, and `investigator` is how a diagram's relationships get checked rather than assumed. Neither substitutes for *verify before you write*: a claim about **this** tree is confirmed by reading this tree. |
| **Model** | `sonnet` — the routing decision is a table lookup and the prose comes from settled material; execution, not design. |
| **Preload** | 1 skill · ~1.8k: `mermaid-diagram` — whether a relationship needs a picture is a decision made on every invocation, not one a task states. `onion-architecture` and `ui-architecture` stay on demand, read as a file for vocabulary rather than preloaded, so it documents the system instead of the rule. |
| **Input** | Mode A — the functionality or paths to document. Mode B — the plan, spec or report to convert. Either way, a still-ambiguous surface after the routing table gets stated and stopped on, not picked; material describing behaviour that does not exist yet is also a stop. |
| **Output** | `## Documentation Report`: files written with a one-line summary of what they now say; the surface decision and the routing-table row that produced it; the diagram if any; a mandatory *Could not verify*; a mandatory *Deliberately not documented*. |

Routes to `README.md`, an `AGENTS.md`, a package `docs/`, root `docs/` for a cross-package
ADR, or `specs/` — never to an `INSIGHTS.md` (`/engineering-insights` owns that file) and
never to `docs/plans/` (`planner` owns it).

**Sources**

- [Subagents](https://code.claude.com/docs/en/sub-agents) — "the subagent does that work in
  its own context and returns only the summary"; `skills:` — "The full content of each listed
  skill is injected into the subagent's context at startup… not which skills the subagent can
  access"; the model resolution order. **Gap stated:** no sentence says `tools` restricts
  *paths*, so any path restriction is a prompt-level rule, the same caveat `planner.md`
  carries for its own `Write`.
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — "Give
  Claude a check it can run… Have Claude show evidence rather than asserting success"; the
  trust-then-verify gap: "Claude produces a plausible-looking implementation that doesn't
  handle edge cases. > Fix: Always provide verification… If you can't verify it, don't ship it."
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
  — "Each subagent needs an objective, an output format, guidance on the tools and sources to
  use, and clear task boundaries."
- [Diátaxis — the map](https://diataxis.fr/map/) — the four modes, and the collapse that
  follows when they blur.
- [Docs as code](https://www.writethedocs.org/guide/docs-as-code/) — documentation maintained
  with the same workflow as the code it describes.
- [Documenting architecture decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
  — Title / Status / Context / Decision / Consequences, and "All consequences should be listed
  here, not just the 'positive' ones."
- [C4 model — notation](https://c4model.com/diagrams/notation) — "Every diagram should have a
  title…"; "Every line should be labelled."
- [GitHub — creating diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams)
  — Mermaid renders natively in GitHub markdown.
- [Mermaid flowchart syntax](https://mermaid.js.org/syntax/flowchart.html) — quote
  troublesome label text, capitalise the reserved word `end`, and give a node label starting
  `o`/`x` a leading space or capital.

---

## insight-curator

| | |
|---|---|
| **Responsibility** | Audit the five `INSIGHTS.md` files as one corpus — the same lesson recorded twice, a rule confirmed often enough to be promoted, an evidence locator that no longer resolves, a file near the split threshold — and propose what to do about each, quoted exactly enough to apply or reject unchanged. |
| **Tools** | `Read`, `Grep`, `Glob`, `Bash` — read-only, and no `Skill` tool. Its `Bash` allowlist additionally forbids any command whose path argument begins `server/clones/`. |
| **Model** | `sonnet` — the corpus is small and fixed, every criterion it applies is written in the skill it preloads, and every proposal is gated by a human before anything changes. Its output is not the gate, so it need not be `opus`. |
| **Preload** | 1 skill · ~3.7k: `engineering-insights` — the entire rulebook for its subject (the three gates, the routing, the entry format, the one promotion rule, append-only, the counting trap), and a task saying "audit the insights" names none of it. Everything else is excluded: it judges entries, not code. |
| **Input** | A scope, defaulting to all five files, and optionally a focus (`duplicates`, `promotions`, `stale`, `file health`), defaulting to all four. It stops when asked to write an entry, to prune or apply its own proposals, or to curate anything under `server/clones/`. |
| **Output** | `## Insights Audit`: per-file real entry counts with the counting method stated, duplicate clusters, promotion candidates with the `Rule` quoted verbatim and the second confirmation named, stale entries with the command that showed it, file health, a mandatory *Unsanctioned suggestions*, a mandatory *Deliberately left alone*, a mandatory *Could not verify*. |

**It proposes; it never writes.** The `engineering-insights` skill decides whether one new
finding is worth recording at the moment it is learned, and is the only thing that may edit an
`INSIGHTS.md`. This agent looks at what has already accumulated, across files, after the fact.
They never contend for the same action because only one of them has an action.

**Promotion routing is two-sided, and that is the whole answer to "into skills / docs /
specs".** Sanctioned: a package `AGENTS.md` for a `Rule` confirmed a second time, and a
`docs/` for the reasoning behind a decision. Not a promotion: anything aimed at `specs/` — a
spec is written *before* the thing is built — or at a skill file, which no rule in this repo
routes an insight into. Those go to a mandatory *Unsanctioned suggestions* section, phrased as
a routing rule this repo does not have and naming the sentence that would have to change
first. Dropping `Skill` also closes the only route by which a preloaded skill's own
`allowed-tools` could matter; whether that route is real is unverified, and the body says so.

**Sources**

- [Subagents](https://code.claude.com/docs/en/sub-agents) — the read-only example `tools:
  Read, Grep, Glob, Bash`, where "The subagent can't edit files, write files, or use any MCP
  tools"; "the subagent does that work in its own context and returns only the summary"; the
  model resolution order. `skills:` — "The full skill content is
  injected, not only the description." **Gap stated:** no sentence says `tools` restricts
  *paths*, so any path restriction is a prompt-level rule, the same caveat `planner.md`
  carries for its own `Write`.
- [Skills](https://code.claude.com/docs/en/skills) — "Claude Code loads a listing of skill
  names and descriptions into context so Claude knows what's available… full skill content
  only loads when invoked", which is why this agent's rulebook is preloaded through `skills:`
  rather than requested in prose. **Gap stated:** whether a skill's own `allowed-tools` can
  widen a subagent's allowlist is not verified here; dropping `Skill` makes the question moot
  rather than answering it.
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — "Give
  Claude a check it can run… Have Claude show evidence rather than asserting success", which
  is why every stale finding carries the command that showed it.
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
  — "Each subagent needs an objective, an output format, guidance on the tools and sources to
  use, and clear task boundaries."
- In-repo, cited as such rather than as a URL: `.claude/skills/engineering-insights/SKILL.md`
  — the three gates, the module routing, the entry format whose `Rule` and `Evidence` are the
  units a promotion moves, the single promotion rule, append-only, and the ownerless "Prune
  quarterly" line this agent is the owner for; `docs/README.md` — the five-surface table that
  makes `specs/` an unsanctioned destination.

---

## Adding or editing an agent

- **A new or edited agent does not take effect in the current session.** Claude Code reads
  `.claude/agents/` once at startup. `Agent type 'x' not found` after writing the file is
  that, not a YAML error — restart before debugging the frontmatter.
- **`description` stays on one line, double-quoted** (`AGENTS.md`). It is matcher input, not
  prose; a wrapped `>-` block loads the file with no description at all when the indentation
  slips, and nothing reports it.
- **Verify every name in `skills:` exists** under `.claude/skills/`. A row pointing at a
  missing skill loads nothing, silently.
- **Run `claude plugin validate .claude/agents`** after any frontmatter edit.
- Check that each `description` clause still reaches a branch of the body, and that any new
  `Bash` command an agent needs is allowed by `.claude/settings.json` — a `PreToolUse` hook
  sees every command string, and a subagent cannot answer an interactive approval prompt.
