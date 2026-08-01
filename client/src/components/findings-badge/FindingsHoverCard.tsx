/* FindingsHoverCard — the panel that appears when the counters are hovered:
   a header count plus the worst few findings, each rendered in the same visual
   language as a FindingCard on the PR-detail page (severity glyph, title,
   category, file:line, confidence, rationale) but flattened for a preview. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { PREVIEW_LIMIT, fileLabel, sortBySeverity } from "./helpers";
import { s } from "./styles";

export function FindingsHoverCard({
  findings,
  loading = false,
}: {
  findings: FindingRecord[] | undefined;
  loading?: boolean;
}) {
  const t = useTranslations("common");
  const sorted = React.useMemo(() => sortBySeverity(findings ?? []), [findings]);
  const preview = sorted.slice(0, PREVIEW_LIMIT);
  const rest = sorted.length - preview.length;

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <Icon.Info size={13} />
        {/* While the fetch is in flight we have no count yet — the header says
            what the card IS rather than flashing "0 findings" and correcting
            itself a moment later. */}
        <span>{loading ? t("findingsLoading") : t("findingsHeader", { count: sorted.length })}</span>
      </div>

      {loading && preview.length === 0 ? (
        <div style={s.skeleton} />
      ) : (
        preview.map((f) => (
          <div key={f.id} style={s.item}>
            <div style={s.itemTitleRow}>
              <SeverityBadge severity={f.severity} compact />
              <span style={s.itemTitle}>{f.title}</span>
              <CategoryTag category={f.category} />
            </div>
            <div style={s.itemMetaRow}>
              <span className="mono" style={s.itemFile}>
                {fileLabel(f)}
              </span>
              <ConfidenceNum value={f.confidence} />
            </div>
            <div style={s.itemRationale}>{f.rationale}</div>
          </div>
        ))
      )}

      {rest > 0 && <div style={s.more}>{t("findingsMore", { count: rest })}</div>}
    </div>
  );
}

export default FindingsHoverCard;
