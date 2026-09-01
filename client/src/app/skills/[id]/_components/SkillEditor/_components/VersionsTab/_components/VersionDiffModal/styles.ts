import type { CSSProperties } from "react";
import type { DiffLine } from "../../helpers";

/** Co-located styles for VersionDiffModal. */
export const s = {
  body: { maxHeight: "60vh" } satisfies CSSProperties,
  empty: { padding: "24px", fontSize: 13, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
  pre: { margin: 0, padding: "8px 0" } satisfies CSSProperties,
  line: (type: DiffLine["type"]): CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    fontSize: 13,
    lineHeight: "20px",
    background: type === "add" ? "var(--code-add)" : type === "del" ? "var(--code-del)" : "transparent",
  }),
  gutter: (type: DiffLine["type"]): CSSProperties => ({
    width: 20,
    flexShrink: 0,
    textAlign: "center",
    color: type === "add" ? "var(--code-add-text)" : type === "del" ? "var(--code-del-text)" : "var(--text-muted)",
    userSelect: "none",
  }),
  text: {
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    paddingRight: 16,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;
