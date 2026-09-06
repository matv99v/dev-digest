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
| [researcher](researcher.md) | sonnet | — | Finds facts in the project or on the internet, cited | edits anything, decides anything |
| [planner](planner.md) | opus | 11 skills · ~24k | Turns a request into an executable Development Plan | writes product code |
| [implementer](implementer.md) | sonnet | 12 skills · ~31k | Executes one lane of an approved plan, to green | plans, reviews, commits |
| [test-writer](test-writer.md) | sonnet | 3 skills · ~9.5k | Writes the tests for a change that already exists, and runs the package's suite | writes product code, chases coverage, or is run on a path a live lane owns while a plan is executing |
| [architecture-reviewer](architecture-reviewer.md) | opus | 2 skills · ~4.7k | Reviews a diff against this repo's architecture rules, with evidence | edits, computes a verdict, reports style |
| [plan-verifier](plan-verifier.md) | opus | — | Checks a plan's requirements and Acceptances against the code that was written | reviews anything the plan does not require |
| [doc-writer](doc-writer.md) | sonnet | 1 skill · ~1.8k | Documents what exists, on the surface the content belongs on | writes code, plans, or an INSIGHTS.md entry |

Architecture review is now `architecture-reviewer`; plan conformance against a Development
Plan is `plan-verifier`. Security review still has no agent — `pr-self-review` remains the
only thing that blocks a push, and `implementer`'s `Left for review` section now has two
readers instead of none.

## The chain

```
request → researcher (optional, bounded lookups)
        → planner    → docs/plans/NN-<feature>.md
        → implementer × N lanes, in parallel
        → test-writer (optional — when tests are the deliverable, after the lanes)
        → architecture-reviewer  ┐ fresh context, read-only, no verdict
          plan-verifier          ┘
        → doc-writer (optional — when the change needs documenting)
        → orchestrator: records the lanes' Insights via /engineering-insights
```

The orchestrator is the main session. It reads the plan's `Lanes` section and starts one
`implementer` per lane, handing each its tasks, its **owned paths**, and the union of the
**other lanes' paths** — that last list is how a parallel implementer detects a collision
itself.

---

## researcher

| | |
|---|---|
| **Responsibility** | Establish what is true — in this project's files and history, or in upstream documentation. Every claim carries a locator and a verbatim excerpt. |
| **Tools** | `Read`, `Grep`, `Glob`, `Bash`, `WebSearch`, `WebFetch` — read-only by construction; the body further narrows `Bash` to history and file reads |
| **Model** | `sonnet` |
| **Input** | A specific question. No question, or an unusable one, and it returns clarifications instead of guessing. |
| **Output** | A cited report, plus a mandatory *Not found / gaps* section. |

**Sources**

- [Subagents](https://code.claude.com/docs/en/sub-agents) — the read-only pattern (`tools:
  Read, Grep, Glob, Bash`), and the summary-only return that makes the cited report the
  contract.
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — use a
  subagent so a long exploration does not consume the main context, and scope the
  investigation narrowly rather than reading the tree.

---

## planner

| | |
|---|---|
| **Responsibility** | Decide what will be built, where it goes, in what order, and how it will be proved — then write that to a file an implementer can execute without re-deciding anything. |
| **Tools** | `Read`, `Glob`, `Grep`, `Bash`, `Agent`, `Write`, `Skill`. `Write` is meant for `docs/plans/` only — an agent body cannot restrict a path, so this is a prompt-level rule (`planner.md`), not a technically enforced one. `Agent` delegates a bounded lookup to `researcher`. |
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
| **Tools** | `Read`, `Glob`, `Grep`, `Edit`, `Write`, `Bash`, `Skill` |
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
| **Tools** | `Read`, `Glob`, `Grep`, `Edit`, `Write`, `Bash`, `Skill` |
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
| **Tools** | `Read`, `Glob`, `Grep`, `Edit`, `Write`, `Bash`, `Skill` |
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
