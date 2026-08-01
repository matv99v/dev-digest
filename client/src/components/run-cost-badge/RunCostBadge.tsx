/* RunCostBadge — what one agent run cost, in the two shapes the studio needs.
   Shared across three routes (PR list, PR-detail timeline, run trace drawer),
   which is why it lives here rather than in a route's _components folder. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatCost, formatTokenCount } from "./helpers";

/**
 * `compact`  — "$0.014". Cost alone, for dense contexts: the PR list's COST
 *              column and the trace drawer's COST stat tile.
 * `detailed` — "9,119 tok · $0.0013". Usage plus cost, for the PR-detail
 *              timeline where there's room and the token count is the point.
 */
export type RunCostVariant = "compact" | "detailed";

/** Per-variant decimal places — see formatCost for why they differ. */
const DECIMALS: Record<RunCostVariant, number> = { compact: 3, detailed: 4 };

const baseStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
};

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
  style,
}: {
  costUsd: number | null | undefined;
  /** Only read by the `detailed` variant. */
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: RunCostVariant;
  style?: React.CSSProperties;
}) {
  const t = useTranslations("common");
  const cost = formatCost(costUsd, DECIMALS[variant]);
  const tokens = variant === "detailed" ? formatTokenCount(tokensIn, tokensOut) : null;

  // With no usage recorded either, the detailed variant collapses to the same
  // lone "—" as compact, rather than a dangling separator.
  return (
    <span className="tnum" style={{ ...baseStyle, ...style }}>
      {tokens != null && <>{t("tokensShort", { count: tokens })} · </>}
      {cost}
    </span>
  );
}

export default RunCostBadge;
