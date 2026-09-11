import type { IconName } from "@devdigest/ui";
import type { BlastIndexState } from "@/lib/types";

/** Index status → icon + colour tokens for the honesty badge.
    Icon+text always, per R10 — never colour alone. A plain `Badge` and never
    `CategoryTag`, which renders `null` for any string outside the findings
    taxonomy with no type error (client/INSIGHTS.md, 2026-09-01). */
export const STATUS_STYLE: Record<
  BlastIndexState,
  { icon: IconName; color: string; bg: string }
> = {
  indexed: { icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)" },
  partial: { icon: "AlertTriangle", color: "var(--warn)", bg: "var(--warn-bg)" },
  degraded: { icon: "AlertOctagon", color: "var(--crit)", bg: "var(--crit-bg)" },
  none: { icon: "Slash", color: "var(--text-muted)", bg: "var(--bg-hover)" },
};

/** The two views of the same data. Tree is the default (R10). */
export const VIEWS = ["tree", "graph"] as const;
export type BlastView = (typeof VIEWS)[number];

/** Icon per view, so the toggle is never colour alone either. */
export const VIEW_ICON: Record<BlastView, IconName> = {
  tree: "ListChecks",
  graph: "Workflow",
};

/** Fallback ref for `file:line` links when the response carries no
    `indexed_sha` and no repo is in context. */
export const SHA_FALLBACK = "main";
