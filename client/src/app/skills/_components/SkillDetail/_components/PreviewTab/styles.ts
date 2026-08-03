import type { CSSProperties } from "react";

export const s = {
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 20,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  notice: {
    display: "flex",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    background: "var(--warn-bg)",
    color: "var(--warn)",
    fontSize: 13,
    lineHeight: 1.5,
    marginBottom: 16,
  } satisfies CSSProperties,
} as const;
