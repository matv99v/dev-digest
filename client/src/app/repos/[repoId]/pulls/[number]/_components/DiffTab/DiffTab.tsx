"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, SmartDiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks";
import { notify } from "@/lib/toast";
import type { FindingRecord, PrFile } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("shell");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  // Original order is the default on every mount (R9) — never persisted.
  const [smart, setSmart] = React.useState(false);

  const { data: smartDiff } = useSmartDiff(prId);
  // Severity/finding-id for Smart order's markers come from here — a cache
  // hit on the same ["reviews", prId] key the rest of the PR page already
  // populated (docs/plans/04-smart-diff.md, "Decisions taken against the
  // obvious" #4), not a field on the SmartDiff contract itself.
  const { data: reviews } = usePrReviews(prId);
  const findings: FindingRecord[] = React.useMemo(
    () => (reviews ?? []).flatMap((r) => r.findings),
    [reviews],
  );

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button
              kind="ghost"
              size="sm"
              active={smart}
              aria-pressed={smart}
              onClick={() => setSmart((v) => !v)}
            >
              {smart ? t("diffViewer.smart.toggleToOriginal") : t("diffViewer.smart.toggleToSmart")}
            </Button>
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      {smart ? (
        <SmartDiffViewer groups={smartDiff?.groups ?? []} files={files} findings={findings} commenting={commenting} />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}
