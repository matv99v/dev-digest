import type { CSSProperties } from "react";

export const s = {
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  description: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 18, lineHeight: 1.5 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    marginBottom: 8,
  } satisfies CSSProperties,
  rowText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  message: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  diffLine: (type: "context" | "add" | "remove"): CSSProperties => ({
    padding: "1px 8px",
    whiteSpace: "pre-wrap",
    background:
      type === "add" ? "var(--ok-bg)" : type === "remove" ? "var(--crit-bg)" : "transparent",
    color: type === "add" ? "var(--ok)" : type === "remove" ? "var(--crit)" : "var(--text-secondary)",
  }),
  diffBox: {
    fontSize: 13,
    lineHeight: 1.5,
    maxHeight: 480,
    overflow: "auto",
    border: "1px solid var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
} as const;
