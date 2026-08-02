# Examples

Good/bad pairs for the placement rules in this skill. Adapted from real code in
`client/` — see [in-this-repo.md](./in-this-repo.md).

> **Scope.** Examples of React rules — render factories, keys, conditional rendering,
> derived state, effects — live in
> [react-best-practices](../react-best-practices/SKILL.md). Everything here is about
> *where code goes*.

## Colocate first, promote on a second consumer

```
# ❌ Promoted on prediction. One consumer, but parked in shared as "reusable".
src/components/severity-counters/     ← imported only by PRRow
src/app/repos/[repoId]/pulls/_components/PRRow/

# ✅ Starts beside its only caller.
src/app/repos/[repoId]/pulls/_components/PRRow/
  PRRow.tsx
  SeverityCounters.tsx

# ✅ Promoted once the timeline needed it too — a real second consumer.
src/components/findings-badge/
```

## Where the extracted helper goes

```ts
// ❌ Global utils/ for something that names your domain nouns.
// src/utils/prHelpers.ts
export function isStale(pr: PrMeta) { … }

// ✅ Domain-aware and local to its one caller.
// src/app/repos/[repoId]/pulls/helpers.ts
export function sizeOf(pr: PrMeta): SizeInfo { … }

// ✅ Domain-free and genuinely portable — this one earns src/utils/.
export function clamp(n: number, lo: number, hi: number) { … }
```

The test: could it move to another product unchanged? If not, it is a helper, not a util.

## Three kinds of logic, three files

```tsx
// ❌ All three kinds in the component body.
function PRRow({ pr }) {
  const [hovered, setHovered] = useState(false);
  const { data } = useQuery({ queryKey: ["reviews", pr.id], queryFn: … });   // application
  let critical = 0;                                                          // domain
  for (const f of data ?? []) if (f.severity === "CRITICAL") critical += 1;
  …
}

// ✅ Domain → helpers.ts, no React import, testable without rendering.
export function countsOfFindings(findings: FindingRecord[]): PrFindingCounts { … }

// ✅ Application → lib/hooks/reviews.ts, reusable and independently testable.
export function usePrReviews(prId: string, enabled = true) { … }

// ✅ Presentational state stays in the component that uses it.
const [hovered, setHovered] = useState(false);
```

## Constants: scope tracks usage

```ts
// ❌ A shared constants file for something one component reads.
// src/lib/constants.ts
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

// ✅ Beside the only thing that uses it.
// _components/FindingsPanel/constants.ts
export const LOW_CONFIDENCE_THRESHOLD = 0.65;
```

## Keep paired constants adjacent

```ts
// ✅ One grid track per column key, in the same order. The pairing is the invariant, so
//    the adjacency and the comment are load-bearing — split across files they drift, and
//    the failure is a misaligned table rather than a type error.
export const GRID = "1fr 132px 92px 60px 96px 118px 72px 78px";
export const COLUMN_KEYS = [
  "pullRequest", "author", "size", "score", "findings", "status", "cost", "updated",
];
```

## Never shadow a canonical definition

```ts
// ❌ A third severity map, one directory over, that quietly disagrees.
const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  SUGGESTION: "var(--accent)",   // everywhere else this is var(--sugg)
};

// ✅ Read the one definition.
import { SEV } from "@devdigest/ui";
```

## Barrels: narrow yes, wide no

```ts
// ✅ components/run-cost-badge/index.ts — one component's own surface.
export { RunCostBadge, type RunCostVariant } from "./RunCostBadge";
export { formatCost, formatTokenCount } from "./helpers";
```

```ts
// ❌ components/index.ts — one import drags in the diff viewer, mermaid, the app shell.
export * from "./run-cost-badge";
export * from "./findings-badge";
export * from "./diff-viewer";
export * from "./mermaid-diagram";
```

```ts
// ❌ Importing a sibling through your own barrel — creates index → module → index.
import { formatCost } from "./index";

// ✅ Direct.
import { formatCost } from "./helpers";
```

## Dependency direction

```ts
// ❌ A shared component reaching into a route. Now it is not shared.
// src/components/findings-badge/FindingsCell.tsx
import { STATUS_META } from "@/app/repos/[repoId]/pulls/constants";

// ✅ Shared code takes what it needs as props, or the constant moves to shared.
export function FindingsCell({ counts, onOpen }: FindingsCellProps) { … }
```
