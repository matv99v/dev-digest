import type { CSSProperties } from "react";

/** Co-located styles for the Conventions page (mirrors the pulls list page). */
export const s = {
  pageHeader: {
    padding: "24px 32px 10px",
    display: "flex",
    alignItems: "flex-end",
    gap: 16,
  } satisfies CSSProperties,
  pageTitle: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  } satisfies CSSProperties,
  pageSubtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 4,
  } satisfies CSSProperties,
  headerActions: {
    marginLeft: "auto",
    display: "flex",
    gap: 10,
    alignItems: "center",
  } satisfies CSSProperties,
  lastScan: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  loadingStack: {
    padding: "0 32px 44px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "0 32px 14px",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  counter: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  toolbarSpacer: { marginLeft: "auto" } satisfies CSSProperties,
  list: { padding: "0 32px 44px" } satisfies CSSProperties,
} as const;
