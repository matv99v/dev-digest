# docs — e2e

Design notes and decision records for the browser suite: **why** something is the way it
is, when the reason isn't obvious from the code or from `../README.md`.

Good candidates: why `agent-browser` over Playwright, why flows are declarative JSON
rather than code, how the hermetic stack is isolated, why a given journey is or isn't
worth covering.

Don't restate how a flow works here — `../README.md` owns that, and `../../TESTING.md`
owns the suite's place in CI.

## Neighbours

- `../CLAUDE.md` — commands, gotchas, do-not-touch (loaded every session)
- `../INSIGHTS.md` — lessons learned: cause + rule
- `../specs/` — a spec per feature · `../flows/` — the runnable flow files

_No documents yet._
