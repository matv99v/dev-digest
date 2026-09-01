import type { CSSProperties } from "react";

/** Co-located styles for ImportDrawer. */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { paddingTop: 20 } satisfies CSSProperties,
  dropzone: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: "48px 24px",
    border: "1px dashed var(--border-strong)",
    borderRadius: 9,
    textAlign: "center",
  } satisfies CSSProperties,
  dropHint: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  ignored: {
    marginTop: 16,
    padding: 12,
    borderRadius: 7,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  ignoredTitle: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 } satisfies CSSProperties,
  ignoredList: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 12,
    color: "var(--text-muted)",
    lineHeight: 1.7,
  } satisfies CSSProperties,
  inertNote: { fontSize: 12, color: "var(--text-muted)", marginTop: 10 } satisfies CSSProperties,
} as const;
