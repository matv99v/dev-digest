import type { SmartDiffRole } from "@/lib/types";

/** Constants for the DiffViewer. */

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Safety bound when expanding a finding's `start_line..end_line` into the
 * per-file marker map (SmartDiffViewer). This is NOT the server's
 * `MAX_FINDING_LINE_SPAN` (server/src/modules/smart-diff/constants.ts) and
 * must not be kept in sync with it — it only bounds client-side rendering
 * work against a pathological finding (e.g. `end_line` at end-of-file); the
 * server response is already the source of truth for which lines are marked.
 */
export const MARKER_MAX_LINE_SPAN = 200;

/** Message-key map for each Smart order group heading — the group title and
   description come from `shell.json`'s `diffViewer.smart.roles.*`, resolved
   against the `"shell"` namespace `DiffViewer`/`FileCard`/`CodeLine` already
   use (relative paths, since `useTranslations("shell")` scopes lookups). */
export const SMART_ROLE_KEYS: Record<SmartDiffRole, { titleKey: string; descKey: string }> = {
  core: {
    titleKey: "diffViewer.smart.roles.core.title",
    descKey: "diffViewer.smart.roles.core.desc",
  },
  wiring: {
    titleKey: "diffViewer.smart.roles.wiring.title",
    descKey: "diffViewer.smart.roles.wiring.desc",
  },
  boilerplate: {
    titleKey: "diffViewer.smart.roles.boilerplate.title",
    descKey: "diffViewer.smart.roles.boilerplate.desc",
  },
};
