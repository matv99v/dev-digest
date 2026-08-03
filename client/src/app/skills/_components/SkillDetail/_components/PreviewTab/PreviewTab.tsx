/* PreviewTab — read-only render of exactly what a reviewing agent receives.
   Renders the CURRENT buffer: the caller passes the merged draft when dirty,
   so an unsaved edit is reflected here too, never just the last save. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { needsVetting } from "@/app/skills/_components/SkillCard";
import { s } from "./styles";

export function PreviewTab({ skill, dirty }: { skill: Skill; dirty?: boolean }) {
  const t = useTranslations("skills");

  return (
    <div>
      <div style={s.subtitle}>{t("preview.subtitle")}</div>
      {needsVetting(skill) && !skill.enabled && (
        <div style={s.notice}>
          <Icon.AlertTriangle size={16} />
          <span>{t("preview.untrustedNotice")}</span>
        </div>
      )}
      <div style={s.card}>
        <h2 style={{ marginBottom: 12 }}>{dirty ? skill.name + " *" : skill.name}</h2>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}

export default PreviewTab;
