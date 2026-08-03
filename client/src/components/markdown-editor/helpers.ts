/** Helpers for MarkdownEditor: a heuristic token estimate + a small debounce
 *  hook. No new dependency — same homegrown-hook convention as the rest of
 *  the app (see e.g. run-cost-badge/helpers.ts for the sibling pattern). */
import { useEffect, useState } from "react";

/**
 * ~4 chars/token, shown while the exact server count is unavailable —
 * mid-debounce, or before the query has resolved — so the counter never
 * blanks out or flickers to zero while the user is typing.
 */
export function heuristicTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Debounces a fast-changing value by `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
