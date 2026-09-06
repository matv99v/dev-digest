import type { IconName } from "@devdigest/ui";
import type { IntentConfidence } from "@/lib/types";

/** Confidence → icon + colour tokens (dot fill / icon colour + matching bg).
    Icon+text always, per R10 — never colour alone. */
export const CONFIDENCE_STYLE: Record<
  IntentConfidence,
  { icon: IconName; color: string; bg: string }
> = {
  high: { icon: "TrendingUp", color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { icon: "Gauge", color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { icon: "TrendingDown", color: "var(--text-muted)", bg: "var(--bg-hover)" },
};
