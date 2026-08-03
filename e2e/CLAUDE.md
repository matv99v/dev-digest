# `@devdigest/e2e` — deterministic browser e2e (agent-browser, no LLM)

## Source of truth

Read this folder's `docs/`, then `README.md`, before the code. Repo-wide rules
live in the root `CLAUDE.md`.

## Read when

**When a trigger applies, read its document before acting** — never up front.

| Trigger | Read |
|---|---|
| Anything breaks non-obviously in this package | `INSIGHTS.md` |
| Writing or running a flow, locator rules, env knobs, coverage | `README.md` |
| Starting a feature here — check for an existing spec first | `specs/` |

## Gotchas

- **`flows/` holds executable test flows; `specs/` holds prose feature specs.**
  Different things — do not merge them.
