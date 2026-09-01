import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { maxWidth: 900 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 6, marginBottom: 16, lineHeight: 1.5 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 10,
  } satisfies CSSProperties,
  versionLabel: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)", width: 32 } satisfies CSSProperties,
  rowBody: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  message: { fontSize: 14, color: "var(--text-primary)", marginBottom: 2 } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } satisfies CSSProperties,
} as const;
