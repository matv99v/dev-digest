/* SkillCard — name/description, type + source badges, a "needs vetting" flag
   for an untrusted skill that hasn't been enabled yet, and an enabled toggle.
   Used both in the /skills grid and as the compact row in the /skills/:id
   left rail (mirrors AgentCard). Usage/accept-rate stats live in the skill's
   own Stats tab, where they carry the attribution caveat and context needed
   to read them correctly — a bare "N agents · X%" here reads as noise for a
   just-created skill and duplicates that tab with less context. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle, SKILL_TYPE } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations("skills");
  const update = useUpdateSkill();
  const needsVetting = skill.source !== "manual" && !skill.enabled;

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Wand2 size={14} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle
            on={skill.enabled}
            onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
            size={14}
          />
        </div>
      </div>
      <div style={s.description}>{skill.description || "—"}</div>
      <div style={s.metaRow}>
        <Badge color={SKILL_TYPE[skill.type].c} bg={SKILL_TYPE[skill.type].bg}>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <Badge color="var(--text-muted)">{t(`listItem.source.${skill.source}`)}</Badge>
        {needsVetting && (
          <span title={t("listItem.vettingTitle")}>
            <Badge color="var(--warn)" bg="var(--warn-bg)">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
    </div>
  );
}
