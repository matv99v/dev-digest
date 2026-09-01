/** A single line in a rendered diff — `same` lines carry context, `add`/`del`
    are the changed lines rendered in green/red. */
export interface DiffLine {
  type: "same" | "add" | "del";
  text: string;
}

/**
 * Line-level diff between two skill-body texts (LCS-based, no library — the
 * client has no diff dependency and a skill body is small enough that
 * O(lines(prev) × lines(next)) is fine).
 */
export function diffLines(prev: string, next: string): DiffLine[] {
  const a = prev.split("\n");
  const b = next.split("\n");
  const n = a.length;
  const m = b.length;

  // dp[i][j] = length of the LCS of a[i:] and b[j:].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: "same", text: a[i]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      result.push({ type: "del", text: a[i]! });
      i += 1;
    } else {
      result.push({ type: "add", text: b[j]! });
      j += 1;
    }
  }
  while (i < n) {
    result.push({ type: "del", text: a[i]! });
    i += 1;
  }
  while (j < m) {
    result.push({ type: "add", text: b[j]! });
    j += 1;
  }
  return result;
}
