/** Styles for the findings hover card. Matches Dropdown's floating-panel
 *  treatment (radius, shadow, pop animation) so the studio has one popover look. */

import type { CSSProperties } from "react";

/** Wide enough for a file path plus a two-line rationale without wrapping mid-word. */
export const CARD_WIDTH = 360;

export const s = {
  card: {
    width: CARD_WIDTH,
    maxWidth: "calc(100vw - 24px)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    boxShadow: "var(--shadow-modal)",
    padding: "10px 0 4px",
    animation: "ddpop .12s ease",
    cursor: "pointer",
  } satisfies CSSProperties,
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "0 14px 8px",
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  item: {
    padding: "9px 14px",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  itemTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  itemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  itemMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 5,
  } satisfies CSSProperties,
  itemFile: {
    fontSize: 12,
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  // Two lines of rationale is enough to judge whether a finding is worth opening;
  // beyond that the card starts competing with the page it floats over.
  itemRationale: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } as CSSProperties,
  more: {
    padding: "8px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  skeleton: {
    height: 54,
    margin: "0 14px 8px",
    borderRadius: 6,
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
};
