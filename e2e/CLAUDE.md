# e2e — `@devdigest/e2e`

Deterministic browser flows over the web app, driven by the `agent-browser` CLI.

## Before answering

Search `e2e/docs/`, `e2e/specs/` and `e2e/INSIGHTS.md` for the topic **before** reading
source. They are curated and may already answer it. (`e2e/specs/` is prose — the
runnable flows are in `e2e/flows/`.)

## Commands

Uses **npm, not pnpm**. Install the CLI globally, once:
`npm i -g agent-browser && agent-browser install`

- `./scripts/e2e.sh` — preferred: a hermetic stack on alternate ports with its own
  freshly-seeded DB
- `npm test` — only against an already-running stack (see the first gotcha)
- `npm run typecheck`

## Invariants

Hold these when adding a flow.

- **Never use the AI `chat` command.** Deterministic locators only (`--url`, `--text`,
  `find role|text|label`) — that is what keeps runs stable, reproducible and key-free.
- **Express every check as a command, not an assertion library.** A non-zero exit *is*
  the assertion: `wait --text` and `wait --url` fail the step by timing out.
- **Flows stay read-only** against seeded data, so nothing triggers an LLM call.

## Gotchas

- Flows assume a **freshly-seeded DB** where the demo repo is the only one. A dev DB
  holding other imported repos makes flows 02/04/05 follow the home redirect to the
  wrong repo and fail. `./scripts/e2e.sh` builds its own, so prefer it.
- Flows live in `flows/*.flow.json`; `specs/` is prose. The two never mix.
- The numeric filename prefix sets run order — it is lexical.

## Never

- Run `docker compose down -v` to "reset" — it destroys the dev DB volume.

## Where to look

- how a flow works, and current coverage → `README.md`
- the suite's place in CI → `../TESTING.md`
- gotchas already hit here → `INSIGHTS.md`
- design decisions → `docs/`
- planning a flow → `specs/`
