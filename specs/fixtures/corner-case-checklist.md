---
name: corner-case-checklist
description: Checks that new logic handles empty, null, and boundary-value inputs, not just the happy path.
type: rubric
---
# Corner Case Checklist
- Flag new/changed logic that has no test for an empty collection or empty
  string input.
- Flag missing coverage for null/undefined where the changed code accepts or
  must guard against them.
- Flag missing coverage for zero, negative, or boundary numeric values
  (min/max, just-inside vs just-outside a limit).
- Flag off-by-one risk at array/loop bounds — first element, last element,
  one past the end.
- Flag concurrent or duplicate invocation of the same operation (double
  submit, re-entrant call, overlapping async calls) when the changed code
  isn't proven idempotent or race-safe.
