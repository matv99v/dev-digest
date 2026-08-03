import type { CSSProperties } from "react";

export const s = {
  metricsRow: { display: "flex", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 10 } satisfies CSSProperties,
  agentsCard: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    marginBottom: 20,
  } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  agentName: { flex: 1, fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  none: { padding: 16, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  note: {
    fontSize: 13,
    color: "var(--text-muted)",
    lineHeight: 1.5,
    padding: 14,
    border: "1px dashed var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
} as const;
