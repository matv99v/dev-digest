import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  wrap: { maxWidth: 1000 } satisfies CSSProperties,
  metricsRow: { display: "flex", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  panelsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    alignItems: "start",
    marginBottom: 20,
  } satisfies CSSProperties,
  section: { marginBottom: 8 } satisfies CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 14 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  tableWrap: {
    overflowX: "auto",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  td: {
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
