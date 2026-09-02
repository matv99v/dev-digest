import type { Convention } from "@devdigest/shared";

/** "N of M accepted" — the acceptance counter shown above the candidate list. */
export function acceptedSummary(candidates: Convention[]): { accepted: number; total: number } {
  return {
    accepted: candidates.filter((c) => c.status === "accepted").length,
    total: candidates.length,
  };
}

/** Local, human-readable rendering of an ISO scan timestamp (falls back to the raw string). */
export function formatScanTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
