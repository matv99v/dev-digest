import type { CSSProperties } from "react";

/** Co-located styles for SkillBodyEditor. */
export const LINE_HEIGHT = 20;

export const s = {
  wrap: {
    border: "1px solid var(--border-strong)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  filename: {
    fontSize: 12,
    color: "var(--text-secondary)",
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  editorBox: { display: "flex" } satisfies CSSProperties,
  gutter: {
    flexShrink: 0,
    padding: "10px 10px 10px 14px",
    textAlign: "right",
    color: "var(--text-muted)",
    fontSize: 13,
    lineHeight: `${LINE_HEIGHT}px`,
    userSelect: "none",
    overflow: "hidden",
    borderRight: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  lineNo: { height: LINE_HEIGHT } satisfies CSSProperties,
  textarea: {
    flex: 1,
    resize: "none",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: `${LINE_HEIGHT}px`,
    padding: "10px 12px",
    overflowY: "auto",
  } satisfies CSSProperties,
} as const;
