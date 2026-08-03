/* StatsTab — usage stats sourced ENTIRELY from the DB (agent_skills joins +
   skill_versions + a live token count). Deliberately does NOT show pull-
   frequency / accept-rate / findings-by-category: `findings` carries no FK
   back to the skill that flagged it, so those numbers don't exist yet — they
   arrive with the eval pipeline (a later lesson), and a placeholder note
   says so instead of a fabricated figure. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Badge, MetricCard, EmptyState, Skeleton, ErrorState } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);

  if (isLoading) {
    return (
      <>
        <Skeleton height={100} />
      </>
    );
  }
  if (isError || !stats) {
    return <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />;
  }

  return (
    <div>
      <div style={s.metricsRow}>
        <MetricCard label={t("stats.usedBy")} value={stats.agents_total} />
        <MetricCard label={t("stats.tokensLabel")} value={stats.tokens} />
        <MetricCard label={t("stats.versionsLabel")} value={stats.versions} />
      </div>

      <div style={s.sectionTitle}>
        {t("stats.lastChanged")}:{" "}
        {stats.last_changed_at ? new Date(stats.last_changed_at).toLocaleDateString() : t("stats.never")}
      </div>

      <div style={s.sectionTitle}>{t("stats.agentsUsingTitle")}</div>
      <div style={s.agentsCard}>
        {stats.agents.length === 0 ? (
          <EmptyState icon="Cpu" title={t("stats.none")} />
        ) : (
          stats.agents.map((a, i) => (
            <div
              key={a.id}
              style={{ ...s.agentRow, borderBottom: i === stats.agents.length - 1 ? "none" : s.agentRow.borderBottom }}
            >
              <span style={s.agentName}>{a.name}</span>
              {!a.link_enabled && <Badge color="var(--text-muted)">{t("stats.disabledForAgent")}</Badge>}
              <Button
                kind="secondary"
                size="sm"
                onClick={() => router.push(`/agents/${a.id}?tab=skills`)}
              >
                {t("stats.open")}
              </Button>
            </div>
          ))
        )}
      </div>

      <div style={s.note}>{t("stats.metricsComingSoon")}</div>
    </div>
  );
}

export default StatsTab;
