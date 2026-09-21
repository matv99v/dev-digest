/* BlastCard — the PR Overview's BLAST RADIUS card (L04).
   Container: useBlast + useExplainBlast, early returns for loading / error /
   unindexed, then Tree or Graph over the same data. The card states how much
   the index can be trusted (`status` + `reason`) rather than letting an empty
   array read as an all-clear. No useEffect (StrictMode double-invocation
   already bit this codebase — client/INSIGHTS.md, 2026-08-29). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  SectionLabel,
  Skeleton,
} from "@devdigest/ui";
import { useBlast, useExplainBlast, useResyncRepoIntel } from "@/lib/hooks";
import { useActiveRepo } from "@/lib/repo-context";
import type { PrBlastRadius } from "@/lib/types";
import { STATUS_STYLE, VIEWS, VIEW_ICON, type BlastView } from "./constants";
import { blastLinkSha } from "./helpers";
import { GraphView } from "./GraphView";
import { s } from "./styles";
import { TreeView } from "./TreeView";

export function BlastCard({ prId }: { prId: string | null }) {
  const t = useTranslations("blast");
  const { activeRepo, repoId } = useActiveRepo();
  const { data, isLoading, isError, refetch } = useBlast(prId);
  const explain = useExplainBlast(prId);
  const resync = useResyncRepoIntel(repoId);
  // Tree is the default view (R10); the toggle is two-way.
  const [view, setView] = React.useState<BlastView>("tree");

  if (isLoading) {
    return (
      <section style={s.card}>
        <Skeleton height={16} width={140} />
        <Skeleton height={80} />
      </section>
    );
  }

  if (isError) {
    return <ErrorState title={t("error.title")} body={t("error.body")} onRetry={() => refetch()} />;
  }

  if (!data) return null;

  if (data.status === "none") {
    // Never an empty tree: "not indexed" and "nothing is affected" are
    // different answers, and only one of them is honest here.
    return (
      <section style={s.card}>
        <SectionLabel icon="Zap">{t("title")}</SectionLabel>
        <StatusBadge data={data} />
        <EmptyState
          icon="Database"
          title={t("empty.title")}
          body={t("empty.body")}
          // `cta` renders a fixed Plus-icon button with no aria-label
          // passthrough — a custom action goes through `secondary`
          // (client/INSIGHTS.md, 2026-09-05).
          secondary={
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              disabled={!repoId || resync.isPending}
              loading={resync.isPending}
              onClick={() => resync.mutate()}
            >
              {t("reanalyze")}
            </Button>
          }
        />
      </section>
    );
  }

  const sha = blastLinkSha(data, activeRepo);
  const repoFullName = activeRepo?.full_name ?? null;
  const callerCount = data.downstream.reduce((n, d) => n + d.callers.length, 0);
  const endpointCount = data.downstream.reduce((n, d) => n + d.endpoints_affected.length, 0);
  const cronCount = data.downstream.reduce((n, d) => n + d.crons_affected.length, 0);

  return (
    <section style={s.card}>
      <div style={s.headerRow}>
        <SectionLabel icon="Zap">{t("title")}</SectionLabel>
        <div style={s.badgeRow}>
          <StatusBadge data={data} />
          {VIEWS.map((v) => (
            <Chip key={v} icon={VIEW_ICON[v]} active={view === v} onClick={() => setView(v)}>
              {t(`view.${v}`)}
            </Chip>
          ))}
          <Button
            kind="secondary"
            size="sm"
            icon="Sparkles"
            disabled={explain.isPending}
            loading={explain.isPending}
            onClick={() => explain.mutate()}
          >
            {explain.isPending ? t("explaining") : t("explain")}
          </Button>
        </div>
      </div>

      <p style={s.summary}>{data.summary}</p>

      <div style={s.statRow}>
        <Badge icon="Code">
          {data.changed_symbols.length} {t("stat.symbols")}
        </Badge>
        <Badge icon="Users">
          {callerCount} {t("stat.callers")}
        </Badge>
        <Badge icon="Globe">
          {endpointCount} {t("stat.endpoints")}
        </Badge>
        <Badge icon="Clock">
          {cronCount} {t("stat.crons")}
        </Badge>
      </div>

      {data.callers_truncated && <p style={s.note}>{t("truncated")}</p>}

      {data.explanation && (
        <div>
          <div style={s.listLabel}>{t("explanation")}</div>
          <p style={s.explanation}>{data.explanation.text}</p>
        </div>
      )}

      {view === "tree" ? (
        <TreeView data={data} repoFullName={repoFullName} sha={sha} />
      ) : (
        <GraphView data={data} repoFullName={repoFullName} sha={sha} />
      )}
    </section>
  );
}

/** Icon + colour + text together, never colour alone (R10). A plain `Badge`:
    `CategoryTag` renders `null` off-taxonomy with no type error
    (client/INSIGHTS.md, 2026-09-01). The server-computed `reason` is rendered
    verbatim inside the badge text, so a screen reader hears why the map is
    incomplete rather than seeing a colour. */
function StatusBadge({ data }: { data: PrBlastRadius }) {
  const t = useTranslations("blast");
  const style = STATUS_STYLE[data.status];
  const label = t(`status.${data.status}`);
  return (
    <Badge icon={style.icon} color={style.color} bg={style.bg}>
      {data.reason ? `${label} — ${data.reason}` : label}
    </Badge>
  );
}
