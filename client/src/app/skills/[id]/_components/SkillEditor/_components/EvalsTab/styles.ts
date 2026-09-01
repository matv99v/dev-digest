import type { CSSProperties } from "react";

/** Co-located styles for EvalsTab. */
export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "60px 28px",
    gap: 10,
  } satisfies CSSProperties,
  icon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
  body: { fontSize: 14, color: "var(--text-secondary)", maxWidth: 360, lineHeight: 1.5 } satisfies CSSProperties,
} as const;
