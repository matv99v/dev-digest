/* AgentCard — model chip, skills count, enabled toggle, and a run/accept/cost
   footer. Used both as the /agents grid tile (deletable) and as the compact
   row in the /agents/:id left rail (read-only navigation — no delete). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Agent, AgentStatsSummary } from "@devdigest/shared";
import { useAgentSkillLinks } from "@/lib/hooks/skills";
import { acceptRateColor, formatAcceptRate, formatAvgCost, modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  skillCount,
  stats,
  onClick,
  onToggle,
  onDelete,
  deleting,
}: {
  ag: Agent;
  active?: boolean;
  /** Linked-skill count. When omitted, the card fetches it itself (cheap —
      React Query dedupes/caches per agent id across every rendered card). */
  skillCount?: number;
  /** Run/accept/cost footer. When omitted, the footer is not rendered — the
      caller decides whether it already has this (batched via
      `useAgentStatsSummaries`) rather than each card fetching it itself. */
  stats?: AgentStatsSummary;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  /** Present only where deletion is allowed (the /agents grid). Omitted in
      the /agents/:id left rail, where the card is read-only navigation. */
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const t = useTranslations("agents");
  // Only fetch when the caller didn't already supply a count.
  const { data: links } = useAgentSkillLinks(skillCount == null ? ag.id : null);
  const resolvedSkillCount = skillCount ?? links?.length;
  const color = modelColor(ag.model);
  return (
    <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        <span style={s.name}>{ag.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Delete agent "${ag.name}"? This cannot be undone.`)) onDelete();
            }}
            disabled={deleting}
            title="Delete agent"
            aria-label="Delete agent"
            style={s.deleteBtn(!!deleting)}
          >
            <Icon.Trash size={14} style={deleting ? { animation: "ddspin 1s linear infinite" } : undefined} />
          </button>
        )}
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)}>
          {ag.model}
        </span>
        {resolvedSkillCount != null && (
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: resolvedSkillCount })}
          </Badge>
        )}
      </div>
      {stats && (
        <div className="mono tnum" style={s.statsRow}>
          <span>{t("card.runs", { count: stats.runs_30d })}</span>
          <span style={s.statSep}>·</span>
          <span style={s.statAccept(acceptRateColor(stats.accept_rate))}>
            {t("card.accept", { rate: formatAcceptRate(stats.accept_rate) })}
          </span>
          <span style={s.statSep}>·</span>
          <span>{t("card.avgCost", { cost: formatAvgCost(stats.avg_cost_usd) })}</span>
        </div>
      )}
    </div>
  );
}
