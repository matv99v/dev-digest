# Where business logic lives

Which file each kind of logic belongs in, once it leaves the JSX.

> **Scope.** How to *write* that logic correctly — derive-don't-store, `useEffect` rules,
> memoization, state lifting, Context, data-fetching mechanics — belongs to
> [react-best-practices](../react-best-practices/SKILL.md). This file answers only where
> each kind of logic physically goes.

Numbered citations refer to [README.md](./README.md).

## Three kinds of logic, three homes (HIGH)

The spine of this file. Classify first, then place.

| Kind | Example | Home | File |
|---|---|---|---|
| **Domain** | Tally severities; decide if a PR is stale; format money | Plain function, no React import | `helpers.ts` beside the caller |
| **Application** | Fetch a PR's reviews; own open/closed state; wire a mutation | Custom hook | `lib/hooks/<domain>.ts` or the feature's `hooks/` |
| **Presentational** | Which variant to render; is this row hovered | The component itself | `Component.tsx` |

- **Always push domain logic into a pure function** — no hooks, no React import, one
  input → one output. It becomes testable without rendering anything, and the test names
  the business rule instead of the UI [10].
- **Always put application logic in a hook**, not in a component body. The component then
  reads like a template, and the fetching or orchestration can be tested and reused apart
  from the markup [10].
- **Never hoist presentational state into a hook for tidiness.** Hover flags and
  open/closed toggles belong where they are used; moving them out adds a file and an
  indirection while removing nothing.

## Extraction needs a trigger (MEDIUM)

Separation has a cost, and the sources recommending it say so themselves:

> "Try to be pragmatic. If a component has only a few lines of JS, it's not necessary to
> separate the logic." [10]

- **Extract only on a trigger**: a second consumer, a test that is awkward to write
  through the UI, or a body long enough that the JSX is hard to find.
- **Never extract on principle.** A hook with one caller that exists only to move lines
  out of a component has added indirection and removed nothing.
- **Never ship a "reusable" hook with hardcoded field names.** Either take the fields as
  parameters, or admit it belongs to one feature and move it there.

## Where the extracted logic goes (HIGH)

Same promotion bar as components ([folders.md](./folders.md)) — usage decides, not
intent:

- **Domain function used by one component** → that component's `helpers.ts`.
- **Domain function used across a feature** → the feature's `helpers.ts`.
- **Domain function with no domain vocabulary at all** → shared `utils/`. If it names
  your business nouns, it is a helper, not a util — see
  [constants-and-helpers.md](./constants-and-helpers.md).
- **Data-access hook** → the shared hooks directory, one file per domain. Keeping them
  together is what stops two components opening two caches of the same resource.
- **Never let a shared hook or util import feature code** [5]. That inverts the
  dependency direction and is the first step to a cycle.

## Keeping the layers honest (CRITICAL)

- **Always keep the domain layer free of React.** The moment a pure function imports a
  hook it stops being testable in isolation, which was the only reason to extract it.
- **Never put HTTP in a component.** Requests go through the data layer so the URL,
  headers, and error shape live in one place.
- **Never scatter query keys across call sites.** One vocabulary per resource, defined
  where the hooks live.
