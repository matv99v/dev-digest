/** Formatting for run cost + token usage. Shared by both RunCostBadge variants. */

/** Rendered whenever a value is unknown. Never "$0.00" — see formatCost. */
export const NO_DATA = "—";

/**
 * Decimal places for every cost figure in the studio.
 *
 * Four, not two or three, because a single review on a cheap model genuinely
 * costs ~$0.0006: at 3 decimals that rounds away to the `<$0.001` floor, which
 * tells the reader nothing and — worse — made the PR list LESS precise than the
 * run timeline showing the very same number. One shared precision keeps the
 * list, the timeline, and the trace tile agreeing.
 */
export const COST_DECIMALS = 4;

/**
 * USD, for one run or for a PR's total.
 *
 * The central rule of this feature: NO cost data reads "—", never "$0.00". A
 * failed run, an unpriced model, and a run recorded before cost tracking
 * existed are all "we don't know" — showing $0.00 would claim it was free,
 * which is a different (and wrong) statement.
 *
 * A genuine 0 is still printed as $0.0000, so the two stay distinguishable.
 *
 * Below the smallest representable value we print `<$0.0001` rather than a
 * rounded-to-nothing "$0.0000".
 */
export function formatCost(usd: number | null | undefined, decimals = COST_DECIMALS): string {
  if (usd == null || !Number.isFinite(usd)) return NO_DATA;
  if (usd === 0) return `$${usd.toFixed(decimals)}`;
  const smallest = 10 ** -decimals;
  if (usd > 0 && usd < smallest) return `<$${smallest.toFixed(decimals)}`;
  return `$${usd.toFixed(decimals)}`;
}

/**
 * Total tokens for one run, thousands-separated (e.g. "9,119"). Distinct from
 * the trace drawer's `formatTokens`, which renders the in→out split ("15k→1.2k")
 * for its TOKENS tile; here the two are summed into a single spend figure.
 */
export function formatTokenCount(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string | null {
  if (tokensIn == null && tokensOut == null) return null;
  return ((tokensIn ?? 0) + (tokensOut ?? 0)).toLocaleString("en-US");
}
