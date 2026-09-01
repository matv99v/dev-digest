import type { CSSProperties } from "react";

/** Co-located styles for SeverityBars. */
export const s = {
  chart: (height: number): CSSProperties => ({
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    height,
  }),
  col: { flex: 1, display: "flex", justifyContent: "center" } satisfies CSSProperties,
  stack: (height: number): CSSProperties => ({
    width: 22,
    height,
    minHeight: 2,
    borderRadius: 3,
    display: "flex",
    // Reversed so the first-listed (lowest-severity) segment renders at the
    // bottom of the stack and critical — listed last — ends up on top.
    flexDirection: "column-reverse",
    overflow: "hidden",
  }),
  segment: (height: number, color: string): CSSProperties => ({ height, background: color }),
  legend: { display: "flex", gap: 16, marginTop: 14 } satisfies CSSProperties,
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legendDot: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 2,
    background: color,
    display: "inline-block",
  }),
} as const;
