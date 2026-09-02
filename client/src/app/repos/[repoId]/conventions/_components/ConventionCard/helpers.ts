import type { ConventionEvidence } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

/** Format an evidence line range ("11" when single-line, else "11-15"). */
export function evidenceLineLabel(evidence: Pick<ConventionEvidence, "line_start" | "line_end">): string {
  return evidence.line_start === evidence.line_end
    ? `${evidence.line_start}`
    : `${evidence.line_start}-${evidence.line_end}`;
}

/**
 * The github.com blob URL for a convention's evidence, pinned to the sha the
 * scan ran against (falling back to the repo's default branch for older
 * candidates scanned before `scanned_sha` was recorded).
 */
export function conventionEvidenceHref(
  repoFullName: string,
  scannedSha: string | null,
  defaultBranch: string,
  evidence: ConventionEvidence,
): string {
  return githubBlobUrl(
    repoFullName,
    scannedSha ?? defaultBranch,
    evidence.path,
    evidence.line_start,
    evidence.line_end,
  );
}
