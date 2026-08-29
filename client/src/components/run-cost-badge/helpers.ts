/** Formatting for run cost + token figures. Kept out of the component so the
    rounding rules can be tested directly — they are the part that breaks. */

/** Rendered when a run has no cost data. Never "$0.00" — that reads as free. */
export const NO_COST = "—";

/**
 * "$0.0013" · "$0.014" · "$0.06" · "—" when unknown.
 *
 * Up to 4 decimals with trailing zeros trimmed, but never fewer than 2, so a
 * sub-cent run keeps its precision while a bigger one reads like money. A
 * genuinely free model (price 0) is real data and renders "$0.00"; only missing
 * data renders the dash.
 */
export function formatCostUsd(cost: number | null | undefined): string {
  if (cost == null || !Number.isFinite(cost)) return NO_COST;
  // Below the 4-decimal floor a run would round to "$0.00" and read as free.
  if (cost > 0 && cost < 0.0001) return "<$0.0001";
  let s = cost.toFixed(4).replace(/0+$/, "");
  if (s.endsWith(".")) s += "00";
  else if (/\.\d$/.test(s)) s += "0";
  return `$${s}`;
}

/** Total tokens for a run with thousands separators, e.g. "9,119". */
export function formatTokenCount(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string {
  return ((tokensIn ?? 0) + (tokensOut ?? 0)).toLocaleString("en-US");
}
