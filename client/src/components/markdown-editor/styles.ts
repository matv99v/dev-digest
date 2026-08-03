/** Inline style objects for MarkdownEditor, keyed off the app's CSS vars —
 *  same convention as run-cost-badge/RunCostBadge.tsx's `baseStyle`. */
import type React from "react";

export const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  border: "1px solid var(--border-strong)",
  borderRadius: 7,
  overflow: "hidden",
  background: "var(--bg-elevated)",
};

export const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-surface)",
};

export const filenameChipStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
};

export const spacerStyle: React.CSSProperties = {
  flex: 1,
};

export const tokenCountStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: 12,
  whiteSpace: "nowrap",
};

/** Fixed body height — a synced gutter can't tolerate a resizable textarea. */
export const BODY_HEIGHT = 320;

export const bodyStyle: React.CSSProperties = {
  display: "flex",
  height: BODY_HEIGHT,
};

export const gutterStyle: React.CSSProperties = {
  flexShrink: 0,
  minWidth: 40,
  padding: "10px 8px",
  textAlign: "right",
  color: "var(--text-muted)",
  background: "var(--bg-surface)",
  borderRight: "1px solid var(--border)",
  overflowY: "hidden",
  fontSize: 13,
  lineHeight: 1.55,
  userSelect: "none",
};

export const textareaStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 12px",
  border: "none",
  outline: "none",
  resize: "none",
  overflowY: "auto",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontSize: 13,
  lineHeight: 1.55,
  whiteSpace: "pre",
  overflowWrap: "normal",
};
