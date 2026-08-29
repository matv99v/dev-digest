/* RunCostBadge — what one agent run cost, in the two shapes the product needs:
   a bare figure for the PR list's COST column, and a tokens · cost line for the
   PR detail surfaces (timeline row, verdict banner).

   The number is read straight off the run — the server snapshots it at
   completion — so rendering this costs zero extra model calls. A run with no
   cost data shows "—", never "$0.00". */
"use client";

import React from "react";
import type { CSSProperties } from "react";
import { formatCostUsd, formatTokenCount } from "./helpers";

const wrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
};

const tokensStyle: CSSProperties = { color: "var(--text-muted)" };

const sepStyle: CSSProperties = { color: "var(--border)" };

export interface RunCostBadgeProps {
  /** USD cost of the run; null when unknown. */
  costUsd: number | null | undefined;
  /** Prompt/completion tokens — only read by the "detailed" variant. */
  tokensIn?: number | null;
  tokensOut?: number | null;
  /** "compact" = the figure alone; "detailed" = "9,119 tok · $0.0013". */
  variant?: "compact" | "detailed";
  /** Font size in px; the surfaces around this component differ. */
  size?: number;
  style?: CSSProperties;
}

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
  size = 12,
  style,
}: RunCostBadgeProps) {
  const cost = formatCostUsd(costUsd);
  if (variant === "compact") {
    return (
      <span className="mono tnum" style={{ ...wrapStyle, fontSize: size, ...style }}>
        {cost}
      </span>
    );
  }
  return (
    <span className="mono tnum" style={{ ...wrapStyle, fontSize: size, ...style }}>
      <span style={tokensStyle}>{formatTokenCount(tokensIn, tokensOut)} tok</span>
      <span style={sepStyle}>·</span>
      <span>{cost}</span>
    </span>
  );
}

export default RunCostBadge;
