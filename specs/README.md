# specs — cross-package

A spec per feature, written **before** it is built. A feature touching more than one
package gets its spec here; a feature contained in one package gets it in that
package's `specs/`.

Name files `NN-short-name.md`, newest number highest.

A good spec is self-contained: it names the files and interfaces involved, states what
is out of scope, and ends with a verification step that proves the feature works. Time
spent making it precise pays off more than time spent watching the implementation.

## Template

```markdown
# NN — Feature name

## Goal
One paragraph: what a user can do afterwards that they can't do now.

## Scope
- The behaviour being added, as a short list.

## Out of scope
- What this deliberately does not do, so it doesn't get built by accident.

## Design
The approach, and the alternatives rejected. Link to `docs/` for deeper reasoning.

## Files touched
- `path/to/file.ts` — what changes and why.

## Verification
How to prove it works end to end: the command to run, the test that must pass, or the
screen to check. Not "it should work".
```

## Contents

_No specs yet._
