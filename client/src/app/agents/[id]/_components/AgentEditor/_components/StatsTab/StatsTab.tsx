"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Badge, Card, CircularScore, Donut, EmptyState, MetricCard, MonoLink, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentStats } from "@/lib/hooks/agents";
import { SeverityBars } from "./_components/SeverityBars";
import { CATEGORY_COLORS } from "./constants";
import { formatCost, formatDurationSeconds, formatTokens } from "./helpers";
import { s } from "./styles";

/** Stats tab — run volume, cost, findings and history for one agent. Pull
    frequency / most-used skills and memory-pulled panels are intentionally
    absent: neither which skills fed a given run nor any memory injection is
    recorded anywhere yet, so there is nothing real to show for them. */
export function StatsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: stats, isLoading } = useAgentStats(agent.id);

  if (isLoading || !stats) {
    return (
      <div style={s.wrap}>
        <div style={s.metricsRow}>
          <Skeleton height={90} />
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

  const categorySegments = Object.entries(stats.findings_by_category).map(([label, value], i) => ({
    label,
    value,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]!,
  }));

  const goToPr = (repoId: string | null, prNumber: number | null) => {
    if (!repoId || !prNumber) return;
    router.push(`/repos/${repoId}/pulls/${prNumber}`);
  };

  return (
    <div style={s.wrap}>
      <div style={s.metricsRow}>
        <MetricCard label={t("stats.totalRuns")} value={stats.runs_30d} trend={stats.runs_trend} />
        <MetricCard
          label={t("stats.avgCostRun")}
          value={formatCost(stats.avg_cost_usd)}
          delta={stats.avg_cost_delta ?? undefined}
        />
        <MetricCard label={t("stats.avgDuration")} value={formatDurationSeconds(stats.avg_duration_ms)} suffix="s" />
        <MetricCard label={t("stats.acceptRate")} value={acceptRateValue} />
      </div>

      <div style={s.panelsGrid}>
        <Card>
          <div style={s.sectionTitle}>{t("stats.findingsBySeverity")}</div>
          <SeverityBars weeks={stats.findings_by_severity_weekly} />
        </Card>

        <Card>
          <div style={s.sectionTitle}>{t("stats.findingsByCategory")}</div>
          {categorySegments.length === 0 ? (
            <div style={s.empty}>{t("stats.noFindings")}</div>
          ) : (
            <Donut segments={categorySegments} valuePrefix="" />
          )}
        </Card>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>{t("stats.runHistory")}</div>
        {stats.runs.length === 0 ? (
          <EmptyState icon="Activity" title={t("stats.empty.title")} body={t("stats.empty.body")} />
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>{t("stats.table.timestamp")}</th>
                  <th style={s.th}>{t("stats.table.pr")}</th>
                  <th style={s.th}>{t("stats.table.tokens")}</th>
                  <th style={s.th}>{t("stats.table.cost")}</th>
                  <th style={s.th}>{t("stats.table.findings")}</th>
                  <th style={s.th}>{t("stats.table.source")}</th>
                  <th style={s.th} />
                </tr>
              </thead>
              <tbody>
                {stats.runs.map((r) => (
                  <tr key={r.run_id}>
                    <td className="mono tnum" style={s.td}>
                      {r.ran_at ? new Date(r.ran_at).toLocaleString() : "—"}
                    </td>
                    <td style={s.td}>
                      {r.pr_number ? (
                        <MonoLink onClick={() => goToPr(r.repo_id, r.pr_number)}>#{r.pr_number}</MonoLink>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="mono tnum" style={s.td}>
                      {formatTokens((r.tokens_in ?? 0) + (r.tokens_out ?? 0) || null)}
                    </td>
                    <td className="mono tnum" style={s.td}>
                      {formatCost(r.cost_usd)}
                    </td>
                    <td className="mono tnum" style={s.td}>
                      {r.findings_count ?? "—"}
                    </td>
                    <td style={s.td}>
                      <Badge
                        color={r.source === "ci" ? "var(--accent-text)" : "var(--text-muted)"}
                        bg={r.source === "ci" ? "var(--accent-bg)" : "var(--bg-hover)"}
                      >
                        {r.source}
                      </Badge>
                    </td>
                    <td style={s.td}>
                      {r.pr_number && (
                        <MonoLink onClick={() => goToPr(r.repo_id, r.pr_number)}>{t("stats.table.viewTrace")}</MonoLink>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
