import { MODEL_COLOR } from "./constants";

/** Resolve the chip colour for an agent's model (unknown → secondary token). */
export function modelColor(model: string): string {
  return MODEL_COLOR[model] ?? "var(--text-secondary)";
}

/** Accept-rate text colour — same 75/50 thresholds as `CircularScore`.
    Null (no decided findings yet) is muted, never read as "bad". */
export function acceptRateColor(rate: number | null | undefined): string {
  if (rate == null) return "var(--text-muted)";
  const pct = rate * 100;
  return pct >= 75 ? "var(--ok)" : pct >= 50 ? "var(--warn)" : "var(--crit)";
}

/** `78%` / `—` — never `0%` for a null (no-signal) rate. */
export function formatAcceptRate(rate: number | null | undefined): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

/** `$0.04` / `—` — never `$0.00` for a null (unpriced) average. */
export function formatAvgCost(usd: number | null | undefined): string {
  return usd == null ? "—" : `$${usd.toFixed(2)}`;
}
