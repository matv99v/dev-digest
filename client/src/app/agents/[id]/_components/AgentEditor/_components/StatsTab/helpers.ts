/** `16000` → `"16k"`, `800` → `"800"`, `null` → `"—"`. */
export function formatTokens(n: number | null): string {
  if (n == null) return "—";
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

/** `6200` (ms) → `"6.2"` (seconds, no unit — the caller supplies `suffix="s"`). `null` → `"—"`. */
export function formatDurationSeconds(ms: number | null): string {
  return ms == null ? "—" : (ms / 1000).toFixed(1);
}

/** `0.06` → `"$0.06"`, `null` → `"—"` — never `$0.00` for an unpriced run. */
export function formatCost(usd: number | null): string {
  return usd == null ? "—" : `$${usd.toFixed(2)}`;
}
