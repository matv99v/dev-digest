export type DiffLineType = "context" | "add" | "remove";
export interface DiffLine {
  type: DiffLineType;
  text: string;
}

/**
 * Line-level diff between two texts (classic LCS backtrack — O(n·m), fine
 * for a skill body's line count). No new dependency: the repo's existing
 * `diff-viewer` is built around a `UnifiedDiff`/PR files, not two arbitrary
 * text blobs, so it doesn't fit a skill-version comparison.
 */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;

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
      result.push({ type: "context", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      result.push({ type: "remove", text: a[i]! });
      i++;
    } else {
      result.push({ type: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: "remove", text: a[i]! });
    i++;
  }
  while (j < m) {
    result.push({ type: "add", text: b[j]! });
    j++;
  }
  return result;
}
