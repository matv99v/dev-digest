"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { MetricCard, Donut, Button, Card, CircularScore, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { CATEGORY_COLORS } from "./constants";
import { s } from "./styles";

/** Stats tab — usage and finding stats. Accept rate is attributed via the
    agent (a finding is credited to every skill the producing agent has
    linked), never rendered as an exact per-skill signal. */
export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: stats, isLoading } = useSkillStats(skill.id);

  if (isLoading || !stats) {
    return (
      <div style={s.wrap}>
        <div style={s.metricsRow}>
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </div>
      </div>
    );
  }

  const acceptRatePct = stats.accept_rate == null ? null : Math.round(stats.accept_rate * 100);
  const acceptRateValue =
    acceptRatePct == null ? t("stats.acceptRateUnknown") : <CircularScore score={acceptRatePct} size={40} />;

  const segments = Object.entries(stats.findings_by_category).map(([label, value], i) => ({
    label,
    value,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]!,
  }));

  return (
    <div style={s.wrap}>
      <div style={s.metricsRow}>
        <MetricCard label={t("stats.usedBy")} value={stats.used_by_count} />
        <MetricCard label={t("stats.acceptRate")} value={acceptRateValue} />
        <MetricCard label={t("stats.findings30d")} value={stats.findings_last_30d} />
      </div>
      <div style={s.hint}>{t("stats.acceptRateHint")}</div>

      <div style={s.panelsGrid}>
        <Card>
          <div style={s.sectionTitle}>{t("stats.agentsUsingThisSkill")}</div>
          {stats.agents.length === 0 ? (
            <div style={s.empty}>{t("stats.noAgents")}</div>
          ) : (
            stats.agents.map((a) => (
              <div key={a.id} style={s.agentRow}>
                <span>{a.name}</span>
                <Button kind="ghost" size="sm" onClick={() => router.push(`/agents/${a.id}?tab=skills`)}>
                  {t("stats.open")}
                </Button>
              </div>
            ))
          )}
        </Card>

        {segments.length > 0 && (
          <Card>
            <div style={s.sectionTitle}>{t("stats.findingsByCategory")}</div>
            <Donut segments={segments} valuePrefix="" />
          </Card>
        )}
      </div>
    </div>
  );
}
