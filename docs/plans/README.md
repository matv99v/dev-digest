# plans — Development Plans

Executable plans written by the `planner` agent and carried out by one or more `implementer`
agents running in parallel. One file per feature, named `NN-short-name.md`, newest number
highest.

## How this differs from `specs/`

They answer different questions and both are worth having.

| | `specs/` | `docs/plans/` |
|---|---|---|
| Question | *What should this do, and why?* | *Who changes which file, in what order?* |
| Audience | a human deciding whether to build it | an agent executing it |
| Lifetime | outlives the work | spent once the lanes are green |
| Written by | a person | the `planner` agent |

A feature can have both: the spec settles the behaviour, the plan schedules the work. A plan
never replaces a spec — if the *what* is unsettled, that is a spec-shaped question and the
planner should be returning clarifications rather than a plan.

## What a plan must contain

The `planner` agent owns the template; see `.claude/agents/planner.md`. The parts that make
a plan executable rather than descriptive:

- **Requirements with ids**, each measurable, each cited by at least one task's Acceptance.
- **Tasks carrying `Type` and owned paths.** `Type` (`backend` · `ui` · `core` · `e2e`) tells
  the implementer which of its loaded skills govern the task. It is what keeps the plan from
  contradicting the implementation rules, so it is never omitted.
- **A dependency DAG**, acyclic.
- **Lanes with disjoint owned paths**, each naming its agent and listing what the *other*
  lanes own — that list is how a parallel implementer detects a collision itself.
- **A real verification command per module**, not "run the tests".

## Running a plan

The orchestrator (the main session) reads the `Lanes` section and starts one implementer per
lane, passing it that lane's tasks, its owned paths, and the union of the other lanes' paths.
Lanes with no dependency between them run in parallel.

Implementers do **not** write to any `INSIGHTS.md` — those files are shared and belong to no
lane, so parallel writes collide. Each returns an `Insights` section instead; the orchestrator
records them together with `/engineering-insights` once every lane has finished.

Once every lane is green, the orchestrator hands the plan and the diff to `plan-verifier` for
a requirement-by-requirement conformance check before recording the lanes' insights.
