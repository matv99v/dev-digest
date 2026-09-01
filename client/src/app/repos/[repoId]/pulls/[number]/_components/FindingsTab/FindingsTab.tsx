"use client";

import React, { useCallback } from "react";
import { Icon, Badge, Button, SectionLabel, EmptyState } from "@devdigest/ui";
import { RunStatus } from "@/app/repos/[repoId]/pulls/[number]/_components/RunStatus";
import { RunHistory, type GoToReviewOpts } from "@/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory";
import { ReviewRunAccordion } from "@/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion";
import { s } from "./styles";
import type { FindingRecord, ReviewRecord, RunSummary, PrCommit, Severity } from "@devdigest/shared";
import type { UseMutationResult } from "@tanstack/react-query";

interface FindingsTabProps {
  prId: string | null;
  liveRunIds: string[];
  reviewRunning: boolean;
  lethalTrifecta: FindingRecord[];
  runs: ReviewRecord[];
  prRuns: RunSummary[] | undefined;
  prCommits: PrCommit[];
  cancelMutation: UseMutationResult<any, any, string, any>;
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  /** "Scroll to this finding", from the PR list's hover preview or a pasted
      ?finding= link. Acted on once per id, once its review has loaded. */
  deepLinkFindingId?: string | null;
  onOpenTrace: (id: string) => void;
  onDelete: (id: string) => void;
  onRunDone: () => void;
}

interface Target {
  runId: string;
  severity?: Severity | null;
  findingId?: string | null;
  n: number;
}

export function FindingsTab({
  prId,
  liveRunIds,
  reviewRunning,
  lethalTrifecta,
  runs,
  prRuns,
  prCommits,
  cancelMutation,
  repoFullName,
  headSha,
  deepLinkFindingId,
  onOpenTrace,
  onDelete,
  onRunDone,
}: FindingsTabProps) {
  const handleCancelAll = useCallback(() => {
    liveRunIds.forEach((id) => cancelMutation.mutate(id));
  }, [liveRunIds, cancelMutation]);

  const handleOpenFirstTrace = useCallback(() => {
    if (liveRunIds[0]) onOpenTrace(liveRunIds[0]);
  }, [liveRunIds, onOpenTrace]);

  const handleOpenTrace = useCallback(
    (id: string) => {
      onOpenTrace(id);
    },
    [onOpenTrace],
  );

  const handleDelete = useCallback(
    (id: string) => {
      onDelete(id);
    },
    [onDelete],
  );

  // Timeline → Review-runs navigation: clicking an agent name, a severity
  // counter, or a finding in its hover preview opens + scrolls to that run's
  // accordion below. The nonce re-triggers the scroll even when the same
  // target is clicked twice.
  const [target, setTarget] = React.useState<Target | null>(null);
  const handleGoToReview = useCallback((runId: string, opts?: GoToReviewOpts) => {
    setTarget((p) => ({ runId, severity: opts?.severity, findingId: opts?.findingId, n: (p?.n ?? 0) + 1 }));
  }, []);

  // This PR's findings keyed by run id — RunHistory renders severity counters
  // + a hover preview for any run with an entry here.
  const findingsByRun = React.useMemo(() => {
    const map = new Map<string, FindingRecord[]>();
    for (const r of runs) {
      if (r.run_id) map.set(r.run_id, r.findings);
    }
    return map;
  }, [runs]);

  // Deep link → target: resolve the finding to its review's run id once reviews
  // have loaded. Acted on ONCE per id — `runs` refetches on a poll or after a
  // new run, and re-scrolling the reader back here every time would be hostile.
  const consumedFindingId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!deepLinkFindingId || runs.length === 0) return;
    if (consumedFindingId.current === deepLinkFindingId) return;
    const review = runs.find((r) => r.findings.some((f) => f.id === deepLinkFindingId));
    if (!review?.run_id) return;
    consumedFindingId.current = deepLinkFindingId;
    setTarget((p) => ({ runId: review.run_id!, findingId: deepLinkFindingId, n: (p?.n ?? 0) + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkFindingId, runs]);

  return (
    <section>
      {liveRunIds.length > 0 && (
        <div style={s.liveRunSection}>
          <SectionLabel
            icon="Sparkles"
            right={
              <div style={s.cancelActions}>
                <Button
                  kind="danger"
                  size="sm"
                  icon="X"
                  loading={cancelMutation.isPending}
                  onClick={handleCancelAll}
                >
                  Cancel
                </Button>
                <Button kind="ghost" size="sm" icon="FileText" onClick={handleOpenFirstTrace}>
                  Open run trace
                </Button>
              </div>
            }
          >
            Live review
          </SectionLabel>
          <RunStatus runIds={liveRunIds} onDone={onRunDone} />
        </div>
      )}

      {reviewRunning && (
        <div style={s.reviewInProgress}>
          <Icon.RefreshCw size={16} style={{ color: "var(--accent)", animation: "ddspin 1s linear infinite" }} />
          <span style={s.reviewInProgressText}>Review in progress…</span>
          <span style={s.reviewInProgressSub}>
            the agent is analyzing the diff — this can take a while on large PRs.
          </span>
        </div>
      )}

      {lethalTrifecta.length > 0 && (
        <div style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={{ color: "var(--crit)" }} />
          <span style={s.lethalTrifectaTitle}>Lethal Trifecta detected</span>
          <Badge color="var(--crit)" bg="transparent">
            {lethalTrifecta.length} finding(s)
          </Badge>
        </div>
      )}

      {((prRuns && prRuns.length > 0) || prCommits.length > 0) && (
        <div style={s.timelineSection}>
          <SectionLabel
            icon="Activity"
            right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>runs &amp; commits · newest first</span>}
          >
            Timeline
          </SectionLabel>
          <RunHistory
            runs={prRuns ?? []}
            commits={prCommits}
            findingsByRun={findingsByRun}
            onOpenTrace={handleOpenTrace}
            onGoToReview={handleGoToReview}
            onDelete={handleDelete}
          />
        </div>
      )}

      <SectionLabel
        icon="AlertOctagon"
        right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>grouped by run · newest first</span>}
      >
        Review runs
      </SectionLabel>
      {runs.length === 0 ? (
        reviewRunning || liveRunIds.length > 0 ? null : (
          <EmptyState
            icon="Sparkles"
            title="No findings yet"
            body="Run a review to generate findings. Use Run Review ▾ above (run all enabled agents or a specific one)."
          />
        )
      ) : (
        prId &&
        runs.map((review, i) => (
          <ReviewRunAccordion
            key={review.id}
            review={review}
            run={prRuns?.find((x) => x.run_id === review.run_id)}
            prId={prId}
            defaultOpen={i === 0}
            repoFullName={repoFullName}
            headSha={headSha}
            targetRunId={target?.runId ?? null}
            targetSeverity={target?.severity ?? null}
            targetFindingId={target?.findingId ?? null}
            targetNonce={target?.n ?? 0}
          />
        ))
      )}
    </section>
  );
}
