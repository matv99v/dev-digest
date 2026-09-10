/* IntentCard — the PR Overview's INTENT card (L03 PR Intent Layer).
   Container: useIntent + useDeriveIntent, early returns for loading / error /
   empty, small presentational body. `stale` is read off the response, never
   stored. No useEffect (StrictMode double-invocation already bit this
   codebase — client/INSIGHTS.md, 2026-08-29). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  type IconName,
  SectionLabel,
  Skeleton,
} from "@devdigest/ui";
import { useIntent, useDeriveIntent } from "@/lib/hooks";
import type { PrIntentDetail, IntentSourceKind } from "@/lib/types";
import { CONFIDENCE_STYLE } from "./constants";
import { s } from "./styles";

export function IntentCard({ prId }: { prId: string | null }) {
  const t = useTranslations("intent");
  const { data, isLoading, isError, refetch } = useIntent(prId);
  const derive = useDeriveIntent(prId);

  const deriveButton = (label: string) => (
    <Button
      kind="secondary"
      size="sm"
      icon="RefreshCw"
      aria-label={t("deriveAria")}
      disabled={derive.isPending}
      loading={derive.isPending}
      onClick={() => derive.mutate()}
    >
      {derive.isPending ? t("deriving") : label}
    </Button>
  );

  if (isLoading) {
    return (
      <section style={s.card}>
        <Skeleton height={16} width={140} />
        <Skeleton height={60} />
      </section>
    );
  }

  if (isError) {
    return (
      <ErrorState title={t("error.title")} body={t("error.body")} onRetry={() => refetch()} />
    );
  }

  if (!data) {
    // The normal "not derived yet" case — a null body, never an error.
    return (
      <section style={s.card}>
        <SectionLabel icon="Target">{t("title")}</SectionLabel>
        <EmptyState
          icon="Target"
          title={t("empty.title")}
          body={t("empty.body")}
          secondary={deriveButton(t("derive"))}
        />
      </section>
    );
  }

  return <IntentBody detail={data} deriveButton={deriveButton} t={t} />;
}

function IntentBody({
  detail,
  deriveButton,
  t,
}: {
  detail: PrIntentDetail;
  deriveButton: (label: string) => React.ReactNode;
  t: ReturnType<typeof useTranslations>;
}) {
  const conf = CONFIDENCE_STYLE[detail.confidence];

  return (
    <section style={s.card}>
      <div style={s.headerRow}>
        <SectionLabel icon="Target">{t("title")}</SectionLabel>
        <div style={s.badgeRow}>
          <Badge dot icon={conf.icon} color={conf.color} bg={conf.bg}>
            {t(`confidence.${detail.confidence}`)}
          </Badge>
          {detail.stale && (
            <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
              {t("stale")}
            </Badge>
          )}
          {deriveButton(t("reDerive"))}
        </div>
      </div>

      <p style={s.narrative}>&ldquo;{detail.intent}&rdquo;</p>

      <div style={s.listsRow}>
        <ScopeList
          label={t("inScope")}
          icon="Check"
          accent="var(--ok)"
          itemColor="var(--text-secondary)"
          items={detail.in_scope}
        />
        <ScopeList
          label={t("outOfScope")}
          icon="X"
          accent="var(--text-muted)"
          itemColor="var(--text-muted)"
          items={detail.out_of_scope}
        />
      </div>

      {detail.sources.length > 0 && (
        <div>
          <div style={s.listLabel}>{t("sources")}</div>
          <div style={s.sourceRow}>
            {detail.sources.map((source, i) => (
              <Badge key={i} icon="Link">
                {sourceLabel(t, source.kind)}
                {source.ref ? ` — ${source.ref}` : ""}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** One scope column: an icon+text header and a `·`-bulleted list. Out-of-scope
    is rendered in the muted colour so the two columns read as "what this PR
    does" vs "what it deliberately doesn't" at a glance, per the design mock. */
function ScopeList({
  label,
  icon,
  accent,
  itemColor,
  items,
}: {
  label: string;
  icon: IconName;
  accent: string;
  itemColor: string;
  items: string[];
}) {
  const I = Icon[icon];
  return (
    <div style={s.listCol}>
      <div style={{ ...s.scopeLabel, color: accent }}>
        <I size={13} aria-hidden />
        <span>{label}</span>
      </div>
      <ul style={s.list}>
        {items.map((item, i) => (
          <li key={i} style={{ ...s.listItem, color: itemColor }}>
            <span style={s.bullet} aria-hidden>
              ·
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function sourceLabel(t: ReturnType<typeof useTranslations>, kind: IntentSourceKind) {
  return t(`sourceKind.${kind}`);
}
