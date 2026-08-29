/* ReviewRunAccordion — one collapsible review RUN (a single agent's pass over
   the PR). Header shows agent + verdict + counts + score + when it ran; the
   body holds that run's VerdictBanner summary and its own FindingsPanel. A PR
   can have many runs (different agents / re-runs over time) — each is separate
   and collapsible so older runs don't bury the latest. */
"use client";

import React from "react";
import { Icon, Badge } from "@devdigest/ui";
import type { ReviewRecord, RunSummary, Verdict, Severity } from "@devdigest/shared";
import { FindingsPanel } from "../FindingsPanel";
import { VerdictBanner } from "../VerdictBanner";
import { useDeleteReview } from "../../../../../../../lib/hooks/reviews";

const VERDICT_COLOR: Record<string, string> = {
  request_changes: "var(--crit)",
  comment: "var(--warn)",
  approve: "var(--ok)",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function ReviewRunAccordion({
  review,
  run,
  prId,
  defaultOpen = false,
  repoFullName,
  headSha,
  targetRunId = null,
  targetSeverity = null,
  targetFindingId = null,
  targetNonce = 0,
}: {
  review: ReviewRecord;
  /** The agent_runs row this review came from (matched on run_id upstream) —
   *  carries the cost/tokens the review row itself doesn't. */
  run?: RunSummary;
  prId: string;
  defaultOpen?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** When this matches review.run_id, the accordion opens and scrolls into view
   *  (driven from the Timeline: clicking an agent name, a severity counter, or
   *  a finding in its hover preview navigates here). */
  targetRunId?: string | null;
  /** A severity counter was clicked — toggles the panel's severity filter
   *  (clicking the same severity again clears it; this is the only way to
   *  clear it, since the panel itself has no chip row). */
  targetSeverity?: Severity | null;
  /** A specific finding was picked from a hover preview — clears any severity
   *  filter and scrolls straight to that finding's card. */
  targetFindingId?: string | null;
  targetNonce?: number;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [severityFilter, setSeverityFilter] = React.useState<Severity | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const isTarget = !!review.run_id && review.run_id === targetRunId;

  React.useEffect(() => {
    if (!isTarget) return;
    setOpen(true);
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (targetFindingId) {
      setSeverityFilter(null);
    } else if (targetSeverity) {
      setSeverityFilter((prev) => (prev === targetSeverity ? null : targetSeverity));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetNonce, isTarget]);

  // The finding's card only exists in the DOM once the accordion body (and
  // FindingsPanel) has actually rendered, which happens on the render AFTER
  // the effect above opens it — so this waits for `open`, not the nonce.
  React.useEffect(() => {
    if (!isTarget || !targetFindingId || !open) return;
    const id = window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector(`[data-finding-id="${CSS.escape(targetFindingId)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [isTarget, targetFindingId, targetNonce, open]);

  const del = useDeleteReview(prId);
  const findings = review.findings;
  const blockers = findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
  const verdictColor = review.verdict ? VERDICT_COLOR[review.verdict] ?? "var(--text-muted)" : "var(--text-muted)";

  return (
    <div
      ref={rootRef}
      id={review.run_id ? `review-run-${review.run_id}` : undefined}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--bg-surface)",
        marginBottom: 14,
        overflow: "hidden",
        scrollMarginTop: 16,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "13px 16px",
          cursor: "pointer",
          color: "var(--text-primary)",
        }}
      >
        <Icon.Cpu size={15} style={{ color: "var(--text-muted)" }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{review.agent_name ?? "Agent"}</span>
        {review.verdict && (
          <Badge color={verdictColor} bg="transparent">
            {review.verdict.replace("_", " ")}
          </Badge>
        )}
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
          {findings.length} finding{findings.length === 1 ? "" : "s"}
          {blockers > 0 ? ` · ${blockers} blocker${blockers === 1 ? "" : "s"}` : ""}
        </span>
        <span style={{ flex: 1 }} />
        {review.score != null && (
          <Badge mono color="var(--text-secondary)">
            {review.score}
          </Badge>
        )}
        <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {formatWhen(review.created_at)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete this "${review.agent_name ?? "agent"}" review run and its findings?`)) {
              del.mutate(review.id);
            }
          }}
          disabled={del.isPending}
          title="Delete this review run"
          aria-label="Delete this review run"
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
        <Icon.ChevronDown
          size={16}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", color: "var(--text-muted)" }}
        />
      </div>

      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          {review.verdict && (
            <div style={{ marginBottom: 16 }}>
              <VerdictBanner
                verdict={review.verdict as Verdict}
                summary={review.summary}
                score={review.score}
                findingsCount={findings.length}
                blockers={blockers}
                agentName={review.agent_name}
                costUsd={run ? run.cost_usd : undefined}
                tokensIn={run?.tokens_in}
                tokensOut={run?.tokens_out}
              />
            </div>
          )}
          <FindingsPanel
            findings={findings}
            prId={prId}
            repoFullName={repoFullName}
            headSha={headSha}
            severity={severityFilter}
            onClearSeverity={() => setSeverityFilter(null)}
            focusFindingId={isTarget ? targetFindingId : null}
          />
        </div>
      )}
    </div>
  );
}

export default ReviewRunAccordion;
