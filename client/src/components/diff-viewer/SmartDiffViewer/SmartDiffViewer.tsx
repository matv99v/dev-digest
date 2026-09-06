/* SmartDiffViewer — the reviewer-ordered diff (Smart order): the same
   PrFile[] DiffViewer renders, grouped by the server's SmartDiff response
   into Core logic / Wiring / Boilerplate, each file showing severity
   markers on the lines its findings cover and a finding-count badge that
   expands + scrolls to the first one. An ALTERNATIVE to DiffViewer behind
   the Smart/Original toggle in DiffTab — the two are never rendered
   together, so Smart order can never drop DiffViewer's inline-comment
   affordances by accident (they're simply not in this tree when this is).

   Split of "which line is marked" vs. "which severity marks it" (see
   docs/plans/04-smart-diff.md): the server's SmartDiff carries no severity —
   the contract has none — only which lines (`finding_lines`) are covered.
   The severity and finding id come from the FindingRecord[] the PR page has
   already fetched via usePrReviews (a cache hit on `["reviews", prId]`), so
   this component takes them as a prop rather than fetching them itself. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile, SmartDiffGroup, SmartDiffFile } from "@/lib/types";
import { SMART_ROLE_KEYS } from "@/components/diff-viewer/constants";
import {
  buildMarkerMap,
  computeRoleOpen,
  defaultOpenFor,
  findingCountFor,
  firstMarkedLine,
} from "@/components/diff-viewer/helpers";
import { s } from "@/components/diff-viewer/styles";
import { FileCard } from "@/components/diff-viewer/FileCard";
import type { DiffCommentApi } from "@/components/diff-viewer/comments";

interface ScrollTarget {
  path: string;
  line: number;
  nonce: number;
}

export function SmartDiffViewer({
  groups,
  files,
  findings,
  commenting,
}: {
  groups: SmartDiffGroup[];
  /** The tab's already-fetched PrFile[] — joined to each group's entries by
     `path`; a smart-diff entry with no match here is skipped (R10). */
  files: PrFile[];
  /** All of this PR's findings (any review, dismissed or not) — filtered per
     file by the pure helpers above. */
  findings: FindingRecord[];
  commenting?: DiffCommentApi;
}) {
  const t = useTranslations("shell");
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const fileByPath = React.useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);

  const findingsByPath = React.useMemo(() => {
    const map = new Map<string, FindingRecord[]>();
    for (const f of findings) {
      const list = map.get(f.file);
      if (list) list.push(f);
      else map.set(f.file, [f]);
    }
    return map;
  }, [findings]);

  const joinedGroups = React.useMemo(
    () =>
      groups.map((group) => ({
        group,
        entries: group.files
          .map((sf) => ({ sf, pf: fileByPath.get(sf.path) }))
          .filter((e): e is { sf: SmartDiffFile; pf: PrFile } => !!e.pf),
      })),
    [groups, fileByPath],
  );
  const totalFiles = joinedGroups.reduce((n, g) => n + g.entries.length, 0);

  // Open/closed is OWNED here, not by each FileCard, so a badge click can
  // expand a collapsed file without remounting it. An earlier version forced
  // it open by flipping the card's React `key`; that remounted the subtree
  // and silently discarded whatever it held — an unsent InlineComposer draft
  // above all. A path absent from this map has not been touched yet and falls
  // back to its computed initial state.
  const [openByPath, setOpenByPath] = React.useState<Record<string, boolean>>({});
  const [scrollTarget, setScrollTarget] = React.useState<ScrollTarget | null>(null);

  const handleBadgeClick = React.useCallback((path: string, line: number | null) => {
    setOpenByPath((prev) => (prev[path] ? prev : { ...prev, [path]: true }));
    if (line != null) {
      setScrollTarget((prev) => ({ path, line, nonce: (prev?.nonce ?? 0) + 1 }));
    }
  }, []);

  // Runs on every click — including a second click on an already-open file,
  // which must scroll again (R13). Mirrors ReviewRunAccordion.tsx:64-87's
  // `{ id, nonce }` pattern. Both state updates above are batched into one
  // re-render, so the file is already open — and its marked line already in
  // the DOM — by the time this rAF callback runs.
  React.useEffect(() => {
    if (!scrollTarget) return;
    const id = window.requestAnimationFrame(() => {
      const selector = `[data-finding-line="${CSS.escape(`${scrollTarget.path}:${scrollTarget.line}`)}"]`;
      rootRef.current?.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [scrollTarget]);

  if (totalFiles === 0) {
    return <div style={s.unavailable}>{t("diffViewer.smart.unavailable")}</div>;
  }

  return (
    <div ref={rootRef}>
      {joinedGroups.map(({ group, entries }) => {
        if (entries.length === 0) return null;
        const keys = SMART_ROLE_KEYS[group.role];
        return (
          <div key={group.role} style={s.smartGroup}>
            <div style={s.smartGroupHeader}>
              <span style={s.smartGroupTitle}>{t(keys.titleKey)}</span>
              <span style={s.smartGroupDesc}>{t(keys.descKey)}</span>
              <Badge mono>{t("diffViewer.smart.filesCount", { count: entries.length })}</Badge>
            </div>
            <div style={s.list}>
              {entries.map(({ sf, pf }) => {
                const fileFindings = findingsByPath.get(sf.path) ?? [];
                const markers = buildMarkerMap(fileFindings);
                const count = findingCountFor(fileFindings);
                const initialOpen =
                  computeRoleOpen(group.role, sf.finding_lines.length > 0) ?? defaultOpenFor(pf);
                const open = openByPath[sf.path] ?? initialOpen;
                return (
                  <FileCard
                    key={sf.path}
                    file={pf}
                    commenting={commenting}
                    markers={markers}
                    open={open}
                    onOpenChange={(next) =>
                      setOpenByPath((prev) => ({ ...prev, [sf.path]: next }))
                    }
                    headerRight={
                      count > 0 ? (
                        <button
                          type="button"
                          aria-label={t("diffViewer.smart.findingsBadgeLabel", { count, path: sf.path })}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBadgeClick(sf.path, firstMarkedLine(sf));
                          }}
                          style={s.findingBadge}
                        >
                          <Icon.AlertTriangle size={12} />
                          {count}
                        </button>
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
