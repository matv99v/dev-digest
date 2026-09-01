# docs — reviewer-core

Design notes and decision records for the review engine: **why** something is the way it
is, when the reason isn't obvious from the code or from `../README.md`.

Good candidates: why the grounding gate works the way it does, prompt-assembly
trade-offs, why structured output is enforced out-of-band rather than described in the
prompt, scoring decisions.

Don't restate the pipeline here — `../README.md` owns it.

## Neighbours

- `../AGENTS.md` — commands, gotchas, the purity constraint (loaded every session)
- `../INSIGHTS.md` — lessons learned: cause + rule
- `../specs/` — a spec per feature, written before it is built

_No documents yet._
