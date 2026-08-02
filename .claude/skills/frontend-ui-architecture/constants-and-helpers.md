# Constants, helpers, and utilities

Where the small files go — the ones that accumulate fastest and get the least thought.

> **Scope.** Why a constant must not be *declared inside a component body* — the identity
> and memoization consequences — belongs to
> [react-best-practices](../react-best-practices/SKILL.md) §Inline Creation in JSX. This
> file covers only which file each constant and helper lives in.

Numbered citations refer to [README.md](./README.md).

## Constants (MEDIUM)

- **A literal that carries meaning gets a name.** `0.65` says nothing;
  `LOW_CONFIDENCE_THRESHOLD` says why the branch exists. The name is the documentation.
- **A literal that appears twice gets a name.** The second occurrence is where the two
  silently drift apart.
- **Not every literal is a magic number.** `0`, `1`, `-1`, and an empty string are
  usually clearer inline than behind a name.
- **`UPPER_SNAKE_CASE`** for module-level constant values. Lookup maps and config
  objects follow the same convention (`SEVERITY_ORDER`, `STATUS_META`).
- **Always define constants at module level**, never inside the component body — a map
  rebuilt every render defeats memoization downstream.
- **Scope tracks usage, exactly as in [folders.md](./folders.md):**
  - Used in one file → top of that file, unexported.
  - Used across one component folder → that folder's `constants.ts`.
  - Used across one feature → the feature's `constants.ts`.
  - Used app-wide → shared config. Rare, and mostly environment or brand values.
- **Keep paired constants together.** If a grid template must have one column per column
  key, the two live side by side with a comment saying so — separated, they drift and
  the failure is visual, not a type error.

## Helpers vs utils vs lib (MEDIUM)

The three names get used interchangeably, which is why every codebase ends up with all
three holding the same kind of thing. Pick a meaning and hold it:

| Folder | Holds | Knows about your domain? |
|---|---|---|
| `helpers` | Functions serving one component or feature | Yes |
| `utils` | Generic, reusable functions | No |
| `lib` | Wrappers and configuration for third-party packages | Only at the seam |

- **`helpers` is domain-aware and local.** `sizeOf(pr)`, `deriveReviewStatus(...)` — they
  mention your nouns and live beside the code that uses them.
- **`utils` is domain-free and portable.** `debounce`, `formatBytes`, `clamp`. The test:
  could it move to another product unchanged? If not, it is a helper.
- **`lib` is where a third-party dependency is configured once** — the API client, the
  date library with its locale — so the rest of the app imports yours, not theirs. This
  is also the seam that makes the dependency replaceable [5].
- **When in doubt, start with `helpers` next to the caller.** Promote to `utils` when a
  second feature imports it. Demote back when it turns out to have one owner [9].
- **Never create a top-level `utils/` on day one.** It becomes the drawer everything
  unclassifiable goes into, and nothing ever leaves.

## Writing them (MEDIUM)

- **A helper is a pure function**: same input, same output, no side effects, no reads
  from module state. That is what makes it worth putting in its own file.
- **One concern per function.** `formatAndValidateAndSubmit` is three functions.
- **Name for what it returns, not how it works.** `visibleFindings(...)` over
  `filterAndSortFindings(...)` — the caller cares about the result, and the name survives
  a change of algorithm.
- **A helper file that crosses ~150 lines is a module wanting a split**, usually by
  domain rather than alphabetically.

## Types (HIGH)

- **Types used by one component live with it.** Types crossing a boundary live where
  both sides can reach them.
- **Never redeclare a shape that already has a canonical definition.** A local
  `interface Finding` that shadows the real contract will drift, and nothing will tell
  you.
- **Derive types from the source of truth** — infer from the schema or the API contract
  rather than hand-maintaining a parallel copy.
