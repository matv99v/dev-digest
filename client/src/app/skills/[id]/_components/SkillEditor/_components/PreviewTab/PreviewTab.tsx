"use client";

import { useTranslations } from "next-intl";
import { Markdown, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

/** Preview tab — the skill body rendered exactly as the reviewing agent
    receives it, with an untrusted-source notice for anything not written
    manually in this workspace. */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("preview.title")}</h2>
      <div style={s.subtitle}>{t("preview.subtitle")}</div>
      {skill.source !== "manual" && (
        <div style={s.notice}>
          <Icon.AlertTriangle size={16} style={{ flexShrink: 0, color: "var(--warn)" }} />
          <span>{t("preview.untrustedNotice")}</span>
        </div>
      )}
      <div style={s.body}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
