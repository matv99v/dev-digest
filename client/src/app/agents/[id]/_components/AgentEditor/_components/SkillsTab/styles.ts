import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  wrap: { maxWidth: 640 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-secondary)", marginTop: 6, marginBottom: 16, lineHeight: 1.5 } satisfies CSSProperties,
  filterInput: {
    width: "100%",
    fontSize: 13,
    padding: "8px 12px",
    marginBottom: 14,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    outline: "none",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: (unlinked: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    opacity: unlinked ? 0.65 : 1,
  }),
  dragHandle: { color: "var(--text-muted)", cursor: "grab", display: "flex", flexShrink: 0 } satisfies CSSProperties,
  name: { fontSize: 13, fontWeight: 600, flex: 1 } satisfies CSSProperties,
  emptyFilter: { fontSize: 13, color: "var(--text-muted)", padding: "20px 0" } satisfies CSSProperties,
} as const;
