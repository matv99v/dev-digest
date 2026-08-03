/* SkillCard — icon, name, type/source/vetting badges, global enabled toggle,
   and a real-data-only footer ({n} agents · v{version}). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { needsVetting, sourceIcon, typeStyle } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  agentsCount,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  agentsCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const { color, icon } = typeStyle(skill.type);
  const TypeIcon = Icon[icon];
  const vetting = needsVetting(skill);

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox(color)}>
          <TypeIcon size={14} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.badgeRow}>
        <Badge color={color} mono>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <Badge color="var(--text-muted)" icon={sourceIcon(skill.source)}>
          {t(`listItem.source.${skill.source}`)}
        </Badge>
        {vetting && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("listItem.needsVetting")}
          </Badge>
        )}
      </div>
      {agentsCount !== undefined && (
        <div style={s.metaRow}>
          <span>{t("stats.agentsCount", { count: agentsCount })}</span>
          <span>·</span>
          <span className="mono">{t("preview.version", { version: skill.version })}</span>
        </div>
      )}
    </div>
  );
}

export default SkillCard;
