# Examples

Before/after pairs for the five mistakes that actually happen in `client/`, then one
full walkthrough. Every path is real — open the "after" file if the pattern is unclear.

## 1. Fat route → thin route + colocated view

```tsx
// ❌ src/app/agents/page.tsx — the route owns the data, the state and the markup
"use client";
export default function AgentsPage() {
  const { data, isLoading } = useAgents();
  const [creating, setCreating] = useState(false);
  const sorted = [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return ( /* 120 lines of JSX, a modal, and three inline style objects */ );
}
```

```tsx
// ✅ src/app/agents/page.tsx — this is the whole file
import { AgentsListView } from "./_components/AgentsListView";

/* Route: /agents (Agents list). Thin route entry — the view, its create modal,
   styles, constants, helpers and i18n are colocated under _components/AgentsListView. */
export default function AgentsPage() {
  return <AgentsListView />;
}
```

```
src/app/agents/
├── page.tsx
└── _components/AgentsListView/
    ├── AgentsListView.tsx        # "use client" lives here, not on the route
    ├── AgentsListView.test.tsx
    ├── index.ts
    ├── styles.ts                 # the inline style objects
    ├── helpers.ts                # the sort
    └── _components/CreateAgentModal/
```

The route file stays a one-line statement of *what URL renders what*. Everything that
can change without the URL changing lives one level down.

## 2. `fetch` in a component → `api.ts` + a hook

```tsx
// ❌ inside a component — a second base URL, no ApiError, untestable
const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/repos/${id}/insights`);
const insights = await res.json();
```

```ts
// ✅ src/lib/api.ts already owns API_BASE, ApiError and header handling.
//    Add the hook next to its domain siblings: src/lib/hooks/reviews.ts
export function useInsights(repoId: string) {
  return useQuery({
    queryKey: ["insights", repoId],
    queryFn: () => api.get<Insight[]>(`/repos/${repoId}/insights`),
  });
}
```

```tsx
// ✅ the component just consumes it
const { data, isLoading, error } = useInsights(repoId);
```

`src/lib/api.ts` normalises every error into `ApiError` so the toast/inline/full-screen
error taxonomy can branch on `status`. A raw `fetch` opts out of all of that silently.

## 3. Deep relative import → alias

```ts
// ❌ src/app/settings/[section]/_components/SettingsView/_components/SettingsApiKeys/SettingsApiKeys.tsx
import type { Settings } from "../../../../../../../lib/types";
import { useSettings } from "../../../../../../../lib/hooks";

// ❌ src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.test.tsx
import messages from "../../../../../../../../messages/en/prReview.json";
```

```ts
// ✅
import type { Settings } from "@/lib/types";
import { useSettings } from "@/lib/hooks";

// ✅ messages/ is outside src/, so hop out through the alias
import messages from "@/../messages/en/prReview.json";
```

Count the dots before you commit: one `../` is a sibling folder and fine; seven means
the import survives only as long as nobody moves the folder.

## 4. `export *` → curated public API

```ts
// ❌ src/components/app-shell/index.ts — helpers.ts and constants.ts are now public too
export * from "./AppShell";
```

```ts
// ✅ src/components/severity-counts/index.ts — say what leaves
export { SeverityCounts } from "./SeverityCounts";
export type { SeverityCountsProps } from "./SeverityCounts";
export { countBySeverity, totalCount, SEVERITY_KEYS } from "./helpers";
export type { SeverityCountMap } from "./helpers";
```

The barrel is the folder's contract. What it omits, you are free to rename tomorrow.

## 5. Copy-paste → promotion

The pulls page needs a status badge. Two weeks later the agents page needs the same one.

```
❌ src/app/repos/[repoId]/pulls/_components/StatusBadge/StatusBadge.tsx
   src/app/agents/_components/StatusBadge/StatusBadge.tsx      ← pasted copy
```

They will disagree within a month — one gets a new status, the other doesn't.

```
✅ src/components/status-badge/
   ├── StatusBadge.tsx
   ├── StatusBadge.test.tsx
   ├── index.ts
   └── styles.ts
```

```tsx
// both routes now
import { StatusBadge } from "@/components/status-badge";
```

The move is only finished when both original files are **deleted**. Promotion that
leaves the original behind is duplication with extra steps.

Note the direction: promote on the *second* consumer, not the first. A component sitting
in `src/components/` with one importer is a file everyone must consider and nobody can
safely change.

---

## Walkthrough: add `/repos/[repoId]/insights`

A page listing recent review runs for a repo, filterable by status.

### 1. Files

```
client/
├── messages/en/insights.json                          # new namespace
└── src/
    ├── lib/hooks/reviews.ts                           # + useInsights (existing file)
    └── app/repos/[repoId]/insights/
        ├── page.tsx                                   # thin
        ├── constants.ts                               # STATUS_FILTERS, GRID
        └── _components/
            ├── InsightsView/
            │   ├── InsightsView.tsx                   # "use client" — owns filter state
            │   ├── InsightsView.test.tsx
            │   ├── index.ts
            │   ├── styles.ts
            │   └── helpers.ts                         # filterByStatus (pure)
            └── InsightRow/
                ├── InsightRow.tsx
                ├── InsightRow.test.tsx
                ├── index.ts
                └── styles.ts
```

### 2. Skeletons

```tsx
// src/app/repos/[repoId]/insights/page.tsx
import { InsightsView } from "./_components/InsightsView";

/* Route: /repos/[repoId]/insights. Thin route entry — view, styles, constants,
   helpers and i18n are colocated under _components/InsightsView. */
export default function InsightsPage() {
  return <InsightsView />;
}
```

```ts
// src/app/repos/[repoId]/insights/constants.ts
import type { RunStatus } from "@/lib/types";

export const STATUS_FILTERS: RunStatus[] = ["QUEUED", "RUNNING", "DONE", "FAILED"];
export const GRID = "1fr 120px 160px 90px";
```

```ts
// .../InsightsView/helpers.ts — pure, so the test needs no render
import type { Insight, RunStatus } from "@/lib/types";

export function filterByStatus(rows: Insight[], status: RunStatus | null): Insight[] {
  return status ? rows.filter((r) => r.status === status) : rows;
}
```

```tsx
// .../InsightsView/InsightsView.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Card } from "@devdigest/ui";
import { useInsights } from "@/lib/hooks";
import type { RunStatus } from "@/lib/types";
import { STATUS_FILTERS } from "../../constants";
import { InsightRow } from "../InsightRow";
import { filterByStatus } from "./helpers";
import { s } from "./styles";

export function InsightsView() {
  const t = useTranslations("insights");
  const { repoId } = useParams<{ repoId: string }>();
  const [status, setStatus] = useState<RunStatus | null>(null);
  const { data, isLoading, error } = useInsights(repoId);
  // …loading / error / empty branches as early returns, then the list
}
```

```ts
// .../InsightsView/index.ts
export { InsightsView } from "./InsightsView";
```

### 3. Decisions this made, and why

| Decision | Reason |
|---|---|
| `page.tsx` renders one component | The route file states what URL renders what; nothing else |
| `constants.ts` at the route folder, not inside the view | `InsightRow` needs `GRID` too, and it is a sibling — not a child of the view |
| `filterByStatus` in `helpers.ts` | Pure, so its test is three lines and needs no DOM |
| `useInsights` added to the existing `reviews.ts` | Domain grouping; a new `insights.ts` would be one hook alone |
| `"use client"` on `InsightsView`, not on `page.tsx` | The filter needs state; the route does not, so the route stays a Server Component |
| Import via `@/lib/…`, `../../constants` via `./` | Left the folder → alias. Own route folder → relative |
| `index.ts` names one export | `helpers.ts` stays private until something outside needs it |

### 4. Finish

```bash
cd client && pnpm typecheck && pnpm test
```
