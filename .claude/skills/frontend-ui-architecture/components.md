# Splitting components, and where the pieces go

When one component should become two, and which folder each half lands in.

> **Scope.** How the extracted pieces must be *written* — render factories, keys,
> conditional rendering, prop counts, composition and `children`, container vs
> presentational — belongs to
> [react-best-practices](../react-best-practices/SKILL.md). This file covers only when
> to split and where the result goes.

Numbered citations refer to [README.md](./README.md).

## When to split (MEDIUM)

- **Split on responsibility, never on line count.** A component should be concerned with
  one thing; if it grows, decompose it [2]. A 300-line component doing one job well is
  healthier than three 100-line components that must be read together.
- **Treat these as the real signals**, in rough order of reliability:
  - You need a comment to explain what a *section* of the JSX is for — that section is a
    component with a name.
  - Two parts of the body change for unrelated reasons.
  - A second consumer appears for one part of it.
  - You cannot test one behaviour without rendering the whole tree.
- **Never split because a threshold was crossed.** Line and prop limits are smoke, not
  fire — they tell you to go looking for a reason, and finding none is an answer.

## Where the extracted component goes (HIGH)

This is the decision the split actually forces, and it follows the promotion bar in
[folders.md](./folders.md):

| Used by | Goes in |
|---|---|
| Only its original parent | The parent's own folder, beside it |
| Several components in one feature or route | That feature's `_components/` |
| Two or more features or routes | Shared `components/` |

- **Always start in the parent's folder.** Moving a file outward later is a rename;
  moving it back after ten importers is a refactor.
- **Never promote on prediction.** A second consumer is the trigger — "we'll reuse this"
  is not one [9].
- **Name the second consumer when you promote.** If you cannot, the component is not
  shared yet. `run-cost-badge` records exactly this in its header comment.

## Symptoms of a split in the wrong place (MEDIUM)

- **Never keep a wrapper that only forwards props.** It adds a hop and hides the real
  component; the reader now opens two files to learn one thing.
- **Never extract a component with one consumer "for reuse."** That is premature
  abstraction — inline it until a second caller exists.
- **Merge two components that must always change together.** A split that forces
  simultaneous edits in two files is a seam in the wrong place, not a seam.
- **Suspect a component that grew a second audience of props.** Serving two callers with
  divergent flags usually means two components sharing a name.
