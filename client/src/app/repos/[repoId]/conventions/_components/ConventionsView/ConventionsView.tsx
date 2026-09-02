/* ConventionsView — page body for /repos/:repoId/conventions: heading, the
   run/re-scan extraction action, the accept/reject candidate list, and the
   entry point into CreateSkillModal. Owns the conventions query. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useActiveRepo } from "@/lib/repo-context";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { acceptedSummary, formatScanTime } from "./helpers";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const { activeRepo } = useActiveRepo();
  const { data: scan, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions();
  const update = useUpdateConvention();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [bulkPending, setBulkPending] = React.useState(false);

  const repoName = activeRepo?.full_name ?? t("page.repoFallback");
  const repoFullName = activeRepo?.full_name ?? "";
  const defaultBranch = activeRepo?.default_branch ?? "main";

  const candidates = scan?.candidates ?? [];
  const hasCandidates = candidates.length > 0;
  const { accepted, total } = acceptedSummary(candidates);
  const hasAccepted = accepted > 0;

  const toggleAll = async () => {
    const targets = hasAccepted
      ? candidates.filter((c) => c.status === "accepted")
      : candidates.filter((c) => c.status === "pending");
    if (targets.length === 0) return;
    setBulkPending(true);
    try {
      await Promise.all(
        targets.map((c) =>
          update.mutateAsync({ id: c.id, patch: { status: hasAccepted ? "pending" : "accepted" } }),
        ),
      );
    } finally {
      setBulkPending(false);
    }
  };

  return (
    <>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>
            {t("page.headingPrefix")}
            {repoName}
          </h1>
          <p style={s.pageSubtitle}>{t("page.subtitle")}</p>
        </div>
        <div style={s.headerActions}>
          {scan?.scanned_at && (
            <span style={s.lastScan}>{t("page.lastScan", { time: formatScanTime(scan.scanned_at) })}</span>
          )}
          <Button
            kind="primary"
            icon="RefreshCw"
            loading={extract.isPending}
            disabled={extract.isPending}
            onClick={() => extract.mutate(repoId)}
          >
            {extract.isPending
              ? t("page.scanning")
              : hasCandidates
                ? t("page.rescan")
                : t("page.runExtraction")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div style={s.loadingStack}>
          <Skeleton height={96} />
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
      ) : isError ? (
        <div style={{ padding: "0 32px 44px" }}>
          <ErrorState
            title={t("page.loadError")}
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => refetch()}
          />
        </div>
      ) : !hasCandidates ? (
        <EmptyState
          icon="ListChecks"
          title={t("page.empty.title")}
          body={t("page.empty.body")}
          cta={t("page.empty.cta")}
          onCta={() => extract.mutate(repoId)}
          ctaLoading={extract.isPending}
        />
      ) : (
        <>
          <div style={s.toolbar}>
            <Button kind="ghost" size="sm" onClick={toggleAll} disabled={bulkPending}>
              {hasAccepted ? t("page.deselectAll") : t("page.selectAll")}
            </Button>
            <span style={s.counter}>{t("page.acceptedCount", { accepted, total })}</span>
            <div style={s.toolbarSpacer} />
            <Button kind="primary" icon="Sparkles" disabled={!hasAccepted} onClick={() => setModalOpen(true)}>
              {t("page.createSkill")}
            </Button>
          </div>
          <div style={s.list}>
            {candidates.map((c) => (
              <ConventionCard
                key={c.id}
                convention={c}
                repoFullName={repoFullName}
                defaultBranch={defaultBranch}
              />
            ))}
          </div>
        </>
      )}

      {modalOpen && (
        <CreateSkillModal repoId={repoId} repoName={repoName} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}
