import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  wrap: { maxWidth: 900 } satisfies CSSProperties,
  metricsRow: { display: "flex", gap: 14, marginBottom: 8 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 24, lineHeight: 1.5 } satisfies CSSProperties,
  panelsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    alignItems: "start",
  } satisfies CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid var(--border)",
    fontSize: 14,
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  loading: { padding: 40, textAlign: "center", color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
