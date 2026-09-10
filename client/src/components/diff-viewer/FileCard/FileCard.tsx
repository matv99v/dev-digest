/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, Severity } from "@/lib/types";
import { defaultOpenFor, parsePatch, type Line } from "@/components/diff-viewer/helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "@/components/diff-viewer/comments";
import { s, chevronFor } from "@/components/diff-viewer/styles";
import { CodeLine } from "@/components/diff-viewer/CodeLine";
import { OutdatedComments } from "@/components/diff-viewer/OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  markers,
  open: openProp,
  onOpenChange,
  headerRight,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Smart order only: highest-severity non-dismissed finding per line
     number, built once per file by the caller (SmartDiffViewer). Absent ⇒
     no markers render, same as today. */
  markers?: Map<number, Severity>;
  /** Smart order only: makes open/closed a CONTROLLED value owned by the
     caller, so a file can be expanded after mount without remounting it
     (a remount would discard an in-progress inline-comment draft). Omit
     both this and `onOpenChange` — as Original order does — and the card
     keeps its own state, byte-for-byte unchanged (R9). */
  open?: boolean;
  /** Called with the next open state whenever the header is clicked. Fires
     in both modes; only the controlled caller has to act on it. */
  onOpenChange?: (open: boolean) => void;
  /** Smart order only: extra content in the file header, right of the
     comment count (e.g. the finding-count badge). */
  headerRight?: React.ReactNode;
}) {
  const t = useTranslations("shell");
  // Uncontrolled fallback: only consulted when the caller passes no `open`.
  const [ownOpen, setOwnOpen] = React.useState(() => defaultOpenFor(file));
  const open = openProp ?? ownOpen;
  const toggle = () => {
    const next = !open;
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={toggle} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
        {headerRight}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                // Findings' start_line/end_line are new-file line numbers —
                // a deleted line only has an oldNo and can never carry a
                // marker (falling back to oldNo here would occasionally
                // collide with an unrelated new-file line number sharing the
                // same numeric value).
                marker={ln.newNo != null ? markers?.get(ln.newNo) : undefined}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
