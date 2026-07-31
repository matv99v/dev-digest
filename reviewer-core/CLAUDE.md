# `@devdigest/reviewer-core` — the review engine (diff → prompt → LLM → findings)

## Source of truth

Read this folder's `docs/`, then `README.md`, before the code. Repo-wide rules
live in the root `CLAUDE.md`.

## Read when

**When a trigger applies, read its document before acting** — never up front.

| Trigger | Read |
|---|---|
| Anything breaks non-obviously in this package | `INSIGHTS.md` |
| Prompt assembly, grounding gate, structured output, scoring | `README.md` |
| Starting a feature here — check for an existing spec first | `specs/` |
| Wording or calibrating an agent's system prompt | `../docs/agent-prompts/README.md` |

## Gotchas

- **Its `node_modules` must be installed or the *server* crashes at boot** with
  `ERR_MODULE_NOT_FOUND` — consumers import this package's raw `src/`.
- **Its `zod` is a separate instance** from the server's, so `instanceof
  z.ZodError` fails across the boundary. Match by shape instead.
