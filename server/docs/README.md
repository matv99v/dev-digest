# docs — server

Design notes and decision records for `@devdigest/api`: **why** something is the way it
is, when the reason isn't obvious from the code or from `../README.md`.

Good candidates: why a module is structured the way it is, why an adapter was chosen,
why a schema is shaped a certain way, a trade-off that was considered and rejected.

Don't restate architecture here — `../README.md` owns the request/DI flow and API map,
and `../src/modules/repo-intel/README.md` owns the indexer.

## Neighbours

- `../AGENTS.md` — commands, gotchas, do-not-touch (loaded every session)
- `../INSIGHTS.md` — lessons learned: cause + rule
- `../specs/` — a spec per feature, written before it is built

_No documents yet._
