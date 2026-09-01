/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, SEV } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingCard";
import { useFindingAction } from "@/lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  severity = null,
  onClearSeverity,
  focusFindingId = null,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Narrows the list to one severity — set by clicking a severity counter in
      the Timeline above. The only way to clear it is clicking it again there,
      or the "Show all" button this renders when set. */
  severity?: Severity | null;
  onClearSeverity?: () => void;
  /** A finding picked from a hover preview — expanded and scrolled to (by the
      accordion) on mount, and seeds j/k navigation from its position. */
  focusFindingId?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);

  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severity),
    [findings, hideLow, severity],
  );

  // A deep-linked finding seeds keyboard nav from its position in the list.
  React.useEffect(() => {
    if (!focusFindingId) return;
    const idx = shown.findIndex((f) => f.id === focusFindingId);
    if (idx >= 0) setFocusIdx(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFindingId]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        {severity && (
          <div style={s.severityNotice}>
            {t("panel.filteredTo", { severity: SEV[severity].label })}
            <button type="button" onClick={onClearSeverity} style={s.showAllButton}>
              {t("panel.showAll")}
            </button>
          </div>
        )}
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={f.id === focusFindingId || i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
