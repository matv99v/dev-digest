import type { CSSProperties } from "react";

export const s = {
  card: {
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderWidth: 1,
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  } satisfies CSSProperties,
  badgeRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  /* The narrative is the PR's own claim about itself, so it reads as a
     quotation — italic, quote-wrapped, matching the design mock. */
  narrative: {
    fontSize: 14,
    lineHeight: 1.6,
    fontStyle: "italic",
    color: "var(--text-secondary)",
    margin: 0,
  } satisfies CSSProperties,
  listsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 20,
  } satisfies CSSProperties,
  listCol: {
    flex: "1 1 240px",
    minWidth: 200,
  } satisfies CSSProperties,
  listLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  /* Scope headers carry an icon as well as text (✓ in scope / ✕ out of
     scope) — never colour alone, per R10. */
  scopeLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    marginBottom: 8,
  } satisfies CSSProperties,
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  listItem: {
    display: "flex",
    gap: 8,
    fontSize: 13.5,
    lineHeight: 1.55,
  } satisfies CSSProperties,
  bullet: {
    flexShrink: 0,
    lineHeight: 1.55,
  } satisfies CSSProperties,
  sourceRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,
} as const;
