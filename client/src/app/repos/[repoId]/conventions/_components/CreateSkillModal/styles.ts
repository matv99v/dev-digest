import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal. */
export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  modeRow: { display: "flex", gap: 8, marginBottom: 18 } satisfies CSSProperties,
  banner: {
    fontSize: 13,
    color: "var(--text-secondary)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "10px 12px",
    marginBottom: 18,
  } satisfies CSSProperties,
  draftCard: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 18,
    marginBottom: 16,
  } satisfies CSSProperties,
  draftHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  } satisfies CSSProperties,
  draftCategory: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)" } satisfies CSSProperties,
  typeRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text-primary)" } satisfies CSSProperties,
} as const;
