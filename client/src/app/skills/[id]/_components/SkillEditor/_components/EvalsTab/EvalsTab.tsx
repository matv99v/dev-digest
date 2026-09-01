"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

/** Evals tab — mount point for L06's eval pipeline. "Run on evals" (in the
    editor header) is disabled until then; this tab explains why. */
export function EvalsTab() {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <div style={s.icon}>
        <Icon.FlaskConical size={22} />
      </div>
      <div style={s.body}>{t("evals.mountBody")}</div>
    </div>
  );
}
