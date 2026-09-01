import { type IconName } from "../icons";

export type Severity = "CRITICAL" | "WARNING" | "SUGGESTION" | "INFO";
export type Category = "bug" | "security" | "perf" | "style" | "test";

export const SEV: Record<
  Severity,
  { c: string; bg: string; icon: IconName; label: string }
> = {
  CRITICAL: { c: "var(--crit)", bg: "var(--crit-bg)", icon: "AlertOctagon", label: "Critical" },
  WARNING: { c: "var(--warn)", bg: "var(--warn-bg)", icon: "AlertTriangle", label: "Warning" },
  SUGGESTION: { c: "var(--sugg)", bg: "var(--sugg-bg)", icon: "Lightbulb", label: "Suggestion" },
  INFO: { c: "var(--info)", bg: "var(--info-bg)", icon: "Info", label: "Info" },
};

export const CAT: Record<Category, { icon: IconName; label: string }> = {
  bug: { icon: "Bug", label: "bug" },
  security: { icon: "Shield", label: "security" },
  perf: { icon: "Zap", label: "perf" },
  style: { icon: "Code", label: "style" },
  test: { icon: "FlaskConical", label: "test" },
};

export type SkillType = "rubric" | "convention" | "security" | "custom";

/** Color-codes a skill's type badge (Skills list, Skills tab). */
export const SKILL_TYPE: Record<SkillType, { c: string; bg: string }> = {
  rubric: { c: "var(--accent-text)", bg: "var(--accent-bg)" },
  convention: { c: "var(--ok)", bg: "var(--ok-bg)" },
  security: { c: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { c: "var(--text-muted)", bg: "var(--bg-hover)" },
};

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  kind?: "primary" | "secondary" | "tertiary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconRight?: IconName;
  active?: boolean;
  full?: boolean;
  /** Shows a spinning indicator and disables the button while a task runs. */
  loading?: boolean;
  children?: React.ReactNode;
}
