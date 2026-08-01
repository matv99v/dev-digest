/** Formatting for run cost + token usage. Shared by both RunCostBadge variants. */

/** Rendered whenever a value is unknown. Never "$0.00" — see formatCost. */
export const NO_DATA = "—";

/**
 * USD for one run.
 *
 * The central rule of this feature: a run with NO cost data reads "—", never
 * "$0.00". A failed run, an unpriced model, and a run recorded before cost
 * tracking existed are all "we don't know" — showing $0.00 would claim the run
 * was free, which is a different (and wrong) statement.
 *
 * A genuine 0 is still printed as $0.000, so the two stay distinguishable.
 *
 * `decimals` differs per variant because the magnitudes differ: the PR list
 * aggregates to cents (`$0.014`), a single timeline run is often a tenth of a
 * cent (`$0.0013`). Below the smallest representable value we print `<$0.001`
 * rather than a rounded-to-nothing "$0.000".
 */
export function formatCost(usd: number | null | undefined, decimals = 3): string {
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
