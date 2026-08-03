import type { CSSProperties } from "react";

/** Co-located styles for ConfigTab — mirrors the agent editor's Config tab. */
export const s = {
  header: { display: "flex", alignItems: "center", marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  enabledLabel: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 12, marginTop: 8 } satisfies CSSProperties,
  savedNote: { fontSize: 12, color: "var(--ok)" } satisfies CSSProperties,
  editorField: { marginBottom: 20 } satisfies CSSProperties,
} as const;
