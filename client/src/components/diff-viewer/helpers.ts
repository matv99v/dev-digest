/** Pure helpers for the DiffViewer. */
import { AUTO_EXPAND_MAX_LINES, HUNK_HEADER_RE, MARKER_MAX_LINE_SPAN } from "./constants";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile, Severity, SmartDiffFile, SmartDiffRole } from "@/lib/types";

export interface Line {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
  oldNo?: number;
  newNo?: number;
}

/** Parse unified-diff patch text into renderable lines with old/new line numbers. */
export function parsePatch(patch: string | null | undefined): Line[] {
  if (!patch) return [];
  const out: Line[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = raw.match(HUNK_HEADER_RE);
      if (m) {
        oldNo = parseInt(m[1]!, 10);
        newNo = parseInt(m[2]!, 10);
      }
      out.push({ kind: "hunk", text: raw });
    } else if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), newNo });
      newNo++;
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), oldNo });
      oldNo++;
    } else {
      out.push({ kind: "ctx", text: raw.slice(raw.startsWith(" ") ? 1 : 0), oldNo, newNo });
      oldNo++;
      newNo++;
    }
  }
  return out;
}

// ---- SmartDiffViewer pure helpers (Smart order only) ----

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

/**
 * Highest-severity marker per line for one file, built once per file (not a
 * per-rendered-line scan over every finding — see the SmartDiffViewer docblock).
 * `findings` must already be scoped to the file (e.g. grouped by `f.file`).
 */
export function buildMarkerMap(findings: FindingRecord[]): Map<number, Severity> {
  const map = new Map<number, Severity>();
  for (const f of findings) {
    if (f.dismissed_at) continue;
    const end = Math.max(f.start_line, Math.min(f.end_line, f.start_line + MARKER_MAX_LINE_SPAN));
    for (let line = f.start_line; line <= end; line++) {
      const existing = map.get(line);
      if (!existing || SEVERITY_RANK[f.severity] > SEVERITY_RANK[existing]) {
        map.set(line, f.severity);
      }
    }
  }
  return map;
}

/** Number of non-dismissed findings on a file — drives the finding-count
   badge. `findings` must already be scoped to the file. */
export function findingCountFor(findings: FindingRecord[]): number {
  return findings.reduce((n, f) => (f.dismissed_at ? n : n + 1), 0);
}

/** FileCard's own initial-open rule, shared so a caller that CONTROLS `open`
   (SmartDiffViewer) computes the same first value FileCard would have picked
   for itself — the rule lives here rather than being duplicated. */
export function defaultOpenFor(file: Pick<PrFile, "additions" | "deletions">): boolean {
  return (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES;
}

/**
 * R11: a `boilerplate` file with findings starts collapsed even so; a
 * `core`/`wiring` file with findings starts expanded; everything else (no
 * findings, either role) falls back to `defaultOpenFor` — signalled by
 * returning `undefined`.
 */
export function computeRoleOpen(role: SmartDiffRole, hasFindingLines: boolean): boolean | undefined {
  if (!hasFindingLines) return undefined;
  return role !== "boilerplate";
}

/** The first marked line for a file (R6 already returns `finding_lines`
   ascending), or `null` when it carries none — targets the badge's scroll. */
export function firstMarkedLine(file: SmartDiffFile): number | null {
  return file.finding_lines[0] ?? null;
}
