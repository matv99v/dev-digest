# docs — cross-package

Design notes and decision records that span more than one package: **why** something is
the way it is, when the reason isn't obvious from the code or the README.

Anything scoped to a single package goes in that package's `docs/` instead.

## What belongs where

| Surface | Holds |
|---|---|
| `README.md` | What the project is and how it fits together — architecture, diagrams, routes. The source of truth |
| `CLAUDE.md` | Commands, package manager, do-not-touch, gotchas, pointers. Loaded every session, so kept short |
| `INSIGHTS.md` | Lessons learned the hard way — cause + rule |
| `docs/` | Design notes and ADRs — the reasoning behind a decision |
| `specs/` | A spec per feature, written before it is built |

Don't restate architecture here — link to `../README.md`.

## Contents

- [`agent-prompts/`](agent-prompts/README.md) — how to write a reviewer agent's system
  prompt, the three shipped reviewer prompts, and how to choose a model.
