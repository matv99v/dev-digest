import type { IconName } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";

/** Detail tab descriptor. `labelKey` resolves under the `skills` namespace's
 *  `detail.tabs`. No Evals tab — the eval pipeline is a later lesson. */
export interface DetailTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

export const TABS: readonly DetailTab[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "stats", labelKey: "detail.tabs.stats", icon: "Gauge" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "History" },
] as const;

export const VALID_TABS: readonly string[] = TABS.map((t) => t.key);

/** The editable snapshot ConfigTab writes to and PreviewTab reads from —
 *  lifted to SkillDetail so both tabs share the SAME unsaved buffer. */
export interface SkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}
