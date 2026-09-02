import type { CSSProperties } from "react";

/** Co-located styles for ConventionCard (mirrors FindingCard's approach). */
export const s = {
  card: (status: "pending" | "accepted" | "rejected"): CSSProperties => ({
    borderRadius: 8,
    // All-longhand (never mix `border` shorthand with `borderLeft` — React
    // warns about updating shorthand + non-shorthand on the same rerender).
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor:
      status === "accepted" ? "var(--ok)" : status === "rejected" ? "var(--text-muted)" : "var(--warn)",
    background: "var(--bg-elevated)",
    overflow: "hidden",
    opacity: status === "rejected" ? 0.6 : 1,
    transition: "opacity .2s, border-color .12s",
    marginBottom: 12,
  }),
  body: { padding: "14px 16px" } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  } satisfies CSSProperties,
  ruleCol: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  ruleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  rule: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  statusTag: (color: string): CSSProperties => ({ fontSize: 12, fontWeight: 600, color }),
  editRow: { display: "flex", alignItems: "center", gap: 8, flex: 1 } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  snippet: {
    margin: "10px 0 0",
    padding: "12px 14px",
    fontSize: 12,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    background: "var(--code-bg)",
    borderRadius: 6,
    whiteSpace: "pre-wrap",
    maxHeight: 180,
    overflow: "auto",
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
} as const;
