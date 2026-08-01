import type { FindingActionKind } from "@devdigest/shared";

/** Sort weight per severity (lower = shown first). Re-exported from the shared
 *  findings-badge component so this panel and the findings hover cards on the PR
 *  list can never disagree about which finding is the worst one. */
export { SEVERITY_ORDER } from "@/components/findings-badge";

/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Keyboard shortcut → finding action. */
export const KEY_TO_ACTION: Record<string, FindingActionKind> = {
  a: "accept",
  d: "dismiss",
};
