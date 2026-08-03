import type { IconName } from "@devdigest/ui";
import type { SkillSource, SkillType } from "@devdigest/shared";

/** Type → chip colour + icon (CSS-var driven, matches AgentCard's per-type chips). */
export const SKILL_TYPE_STYLE: Record<SkillType, { color: string; icon: IconName }> = {
  rubric: { color: "var(--accent)", icon: "ListChecks" },
  convention: { color: "var(--ok)", icon: "GitCommit" },
  security: { color: "var(--crit)", icon: "Shield" },
  custom: { color: "var(--text-secondary)", icon: "Sparkles" },
};

/** Source → icon for the provenance chip. */
export const SKILL_SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "Link",
  community: "Globe",
  imported_url: "Upload",
  imported_file: "Upload",
};

/** Sources that need a human's eyes before they're trusted to run as instructions. */
export const NEEDS_VETTING_SOURCES: readonly SkillSource[] = [
  "imported_url",
  "imported_file",
  "community",
  "extracted",
];
