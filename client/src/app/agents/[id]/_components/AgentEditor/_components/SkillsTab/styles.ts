import type { CSSProperties } from "react";

/** Co-located styles for the agent editor's Skills tab. */
export const s = {
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  filterRow: { margin: "14px 0 6px" } satisfies CSSProperties,
  filterInput: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
  } satisfies CSSProperties,
  orderHint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.45 } satisfies CSSProperties,
  row: (muted: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    marginBottom: 6,
    background: "var(--bg-elevated)",
    opacity: muted ? 0.55 : 1,
  }),
  dragHandle: { color: "var(--text-muted)", cursor: "grab", flexShrink: 0 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0 } satisfies CSSProperties,
  mutedHint: { fontSize: 11, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 2, flexShrink: 0 } satisfies CSSProperties,
  footer: { marginTop: 14 } satisfies CSSProperties,
} as const;
